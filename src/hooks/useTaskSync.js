import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, firebaseConfigured, firestore } from "../utils/firebase";
import { boardFingerprint, incomingSyncAction, initialSyncAction, mergeBoards } from "../utils/boardSync";
import { loadSyncBaseline, saveSyncBaseline } from "../utils/storage";

export function useTaskSync(localState, onApplyState) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(firebaseConfigured ? "signed-out" : "unconfigured");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [syncGeneration, setSyncGeneration] = useState(0);
  const pendingRemoteRef = useRef(null);
  const conflictRef = useRef(false);
  const readyRef = useRef(false);
  const baselineRef = useRef(null);
  const outgoingRef = useRef(new Set());
  const resolvingRef = useRef(false);
  const localStateRef = useRef(localState);
  const applyRef = useRef(onApplyState);
  const unsubscribeRef = useRef(null);

  localStateRef.current = localState;
  applyRef.current = onApplyState;

  const rememberBaseline = useCallback((uid, state) => {
    const fingerprint = boardFingerprint(state);
    baselineRef.current = fingerprint;
    saveSyncBaseline(uid, fingerprint);
  }, []);

  const markReady = useCallback(() => {
    readyRef.current = true;
    setSyncGeneration((generation) => generation + 1);
    setStatus("synced");
  }, []);

  const writeBoard = useCallback(async (uid, state) => {
    const fingerprint = boardFingerprint(state);
    outgoingRef.current.add(fingerprint);
    setStatus("connecting");
    try {
      const stateRef = doc(firestore, "users", uid, "tasky", "state");
      await setDoc(stateRef, { state, updatedAt: serverTimestamp() });
      rememberBaseline(uid, state);
      setError("");
      if (boardFingerprint(localStateRef.current) === fingerprint) setStatus("synced");
    } catch (writeError) {
      setError(writeError.message || "Could not sync your board.");
      setStatus("error");
      throw writeError;
    } finally {
      outgoingRef.current.delete(fingerprint);
      if (boardFingerprint(localStateRef.current) !== fingerprint && readyRef.current) {
        setSyncGeneration((generation) => generation + 1);
      }
    }
  }, [rememberBaseline]);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      readyRef.current = false;
      baselineRef.current = nextUser ? loadSyncBaseline(nextUser.uid) : null;
      outgoingRef.current.clear();
      resolvingRef.current = false;
      pendingRemoteRef.current = null;
      conflictRef.current = false;
      setConflict(false);
      if (nextUser) setError("");
      setUser(nextUser);
      setStatus(nextUser ? "connecting" : "signed-out");
    });
  }, []);

  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).catch((redirectError) => {
      setError(redirectError.message || "Google sign-in could not be completed.");
      setStatus("error");
    });
  }, []);

  useEffect(() => {
    if (!user || !firestore) return undefined;
    const stateRef = doc(firestore, "users", user.uid, "tasky", "state");
    let firstSnapshot = true;
    const unsubscribe = onSnapshot(
      stateRef,
      { includeMetadataChanges: true },
      async (snapshot) => {
        // A cached snapshot may be stale; decide which board wins only after
        // Firestore has checked the server. Ignore our own optimistic writes.
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        if (firstSnapshot) {
          firstSnapshot = false;
          if (!snapshot.exists()) {
            try {
              await writeBoard(user.uid, localStateRef.current);
              markReady();
            } catch { /* writeBoard reports the error */ }
            return;
          }

          const remote = snapshot.data()?.state;
          const action = initialSyncAction(localStateRef.current, remote, baselineRef.current);
          if (action === "same") {
            rememberBaseline(user.uid, remote);
            markReady();
            return;
          }
          if (action === "remote") {
            rememberBaseline(user.uid, remote);
            applyRef.current(remote);
            markReady();
            return;
          }
          if (action === "local") {
            // Only this device changed since the last sync. Upload its board
            // instead of asking the user to resolve a false conflict.
            markReady();
            return;
          }
          pendingRemoteRef.current = remote;
          conflictRef.current = true;
          setConflict(true);
          setStatus("needs-choice");
          return;
        }

        if (!snapshot.exists()) return;
        const remote = snapshot.data()?.state;
        const remoteFingerprint = boardFingerprint(remote);
        if (conflictRef.current || resolvingRef.current) {
          pendingRemoteRef.current = remote;
          return;
        }
        const action = incomingSyncAction(localStateRef.current, remote, baselineRef.current);
        if (outgoingRef.current.has(remoteFingerprint) || action === "same") {
          rememberBaseline(user.uid, remote);
          setStatus("synced");
        } else if (action === "local") {
          // Local edits are still waiting for their debounce/write.
        } else if (action === "remote") {
          rememberBaseline(user.uid, remote);
          applyRef.current(remote);
          setStatus("synced");
        } else {
          pendingRemoteRef.current = remote;
          conflictRef.current = true;
          setConflict(true);
          setStatus("needs-choice");
        }
      },
      (snapshotError) => {
        setError(snapshotError.message || "Could not sync your board.");
        setStatus("error");
      }
    );
    unsubscribeRef.current = unsubscribe;
    return () => {
      unsubscribe();
      if (unsubscribeRef.current === unsubscribe) unsubscribeRef.current = null;
    };
  }, [user, markReady, rememberBaseline, writeBoard]);

  useEffect(() => {
    if (!user || !firestore || !readyRef.current || conflict) return undefined;
    if (boardFingerprint(localState) === baselineRef.current) return undefined;
    const timeout = window.setTimeout(async () => {
      try {
        if (readyRef.current && boardFingerprint(localState) !== baselineRef.current) {
          await writeBoard(user.uid, localState);
        }
      } catch { /* writeBoard reports the error */ }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [user, localState, conflict, syncGeneration, writeBoard]);

  const signIn = useCallback(async () => {
    if (!auth) return;
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      const mobileDevice = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
      const authHelperIsSameOrigin = window.location.hostname === import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
      if (mobileDevice && authHelperIsSameOrigin) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (signInError) {
      setError(signInError.message || "Google sign-in failed.");
      setStatus("error");
    }
  }, []);

  const logOut = useCallback(async () => {
    if (!auth) return false;
    const wasReady = readyRef.current;
    readyRef.current = false;
    try {
      await signOut(auth);
      setError("");
      return true;
    } catch (signOutError) {
      readyRef.current = wasReady;
      setError(signOutError.message || "Could not sign out.");
      return false;
    }
  }, []);

  const resolveConflict = useCallback(async (choice) => {
    const remote = pendingRemoteRef.current;
    if (!remote || !user || resolvingRef.current) return;
    resolvingRef.current = true;
    const selected = choice === "merge" ? mergeBoards(localStateRef.current, remote) : remote;
    try {
      // Persist the merged result before dismissing the choice dialog.
      if (choice === "merge") await writeBoard(user.uid, selected);
      rememberBaseline(user.uid, selected);
      applyRef.current(selected);
      pendingRemoteRef.current = null;
      conflictRef.current = false;
      setConflict(false);
      markReady();
    } catch { /* Keep the choice dialog open so the merge is not lost. */ }
    finally { resolvingRef.current = false; }
  }, [user, markReady, rememberBaseline, writeBoard]);

  return { user, status, error, conflict, configured: firebaseConfigured, signIn, signOut: logOut, resolveConflict };
}
