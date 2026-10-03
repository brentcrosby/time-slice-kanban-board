import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { doc, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, firebaseConfigured, firestore } from "../utils/firebase";
import { boardFingerprint, boardRevision, incomingSyncAction, initialSyncAction, mergeBoards, savedBoard } from "../utils/boardSync";
import { loadSyncBaseline, saveSyncBaseline } from "../utils/storage";

const IMPORT_INTENT_KEY = "tasky:sign-in-import";

const takeRedirectImportIntent = () => {
  try {
    const requested = window.sessionStorage.getItem(IMPORT_INTENT_KEY) === "true";
    window.sessionStorage.removeItem(IMPORT_INTENT_KEY);
    return requested;
  } catch { return false; }
};

export function useTaskSync(localState, onApplyState, onRevisionChange) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(firebaseConfigured ? "signed-out" : "unconfigured");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [syncGeneration, setSyncGeneration] = useState(0);
  const pendingRemoteRef = useRef(null);
  const conflictRef = useRef(false);
  const readyRef = useRef(false);
  const baselineRef = useRef(null);
  const baselineRevisionRef = useRef(0);
  const outgoingRef = useRef(new Set());
  const resolvingRef = useRef(false);
  const localStateRef = useRef(localState);
  const applyRef = useRef(onApplyState);
  const revisionChangeRef = useRef(onRevisionChange);
  const writingRef = useRef(false);
  const unsubscribeRef = useRef(null);
  const canImportRef = useRef(false);

  localStateRef.current = localState;
  applyRef.current = onApplyState;
  revisionChangeRef.current = onRevisionChange;

  const rememberBaseline = useCallback((uid, state) => {
    const fingerprint = boardFingerprint(state);
    baselineRef.current = fingerprint;
    baselineRevisionRef.current = boardRevision(state);
    saveSyncBaseline(uid, fingerprint, baselineRevisionRef.current);
    revisionChangeRef.current?.((revision) =>
      boardFingerprint(localStateRef.current) === fingerprint
        ? baselineRevisionRef.current
        : Math.max(revision, baselineRevisionRef.current + 1)
    );
  }, []);

  const markReady = useCallback(() => {
    canImportRef.current = false;
    readyRef.current = true;
    setSyncGeneration((generation) => generation + 1);
    setStatus("synced");
  }, []);

  const handleConflict = useCallback((uid, remote) => {
    if (canImportRef.current) {
      pendingRemoteRef.current = remote;
      conflictRef.current = true;
      setConflict(true);
      setStatus("needs-choice");
      return;
    }
    // Import is only an onboarding choice. During normal use, the account
    // board wins a concurrent update instead of reopening the import dialog.
    rememberBaseline(uid, remote);
    applyRef.current(remote);
    pendingRemoteRef.current = null;
    conflictRef.current = false;
    setConflict(false);
    markReady();
  }, [rememberBaseline, markReady]);

  const writeBoard = useCallback(async (uid, state) => {
    state = savedBoard(state);
    const fingerprint = boardFingerprint(state);
    const expectedFingerprint = baselineRef.current;
    if (writingRef.current) return;
    writingRef.current = true;
    outgoingRef.current.add(fingerprint);
    setStatus("connecting");
    try {
      const stateRef = doc(firestore, "users", uid, "tasky", "state");
      const result = await runTransaction(firestore, async (transaction) => {
        const snapshot = await transaction.get(stateRef);
        const remote = snapshot.exists() ? snapshot.data()?.state : null;
        if (remote && boardFingerprint(remote) !== expectedFingerprint) {
          return { remote };
        }
        if (!remote && expectedFingerprint !== null) return { remote: null };
        const committed = {
          ...state,
          syncRevision: Math.max(boardRevision(remote), boardRevision(state)) + 1,
        };
        transaction.set(stateRef, { state: committed, updatedAt: serverTimestamp() });
        return { committed };
      });
      if (result.remote !== undefined) {
        if (result.remote) {
          handleConflict(uid, result.remote);
        } else {
          setError("The cloud board was removed while syncing. Your device copy is safe; reload to retry.");
          setStatus("error");
        }
        return null;
      }
      rememberBaseline(uid, result.committed);
      setError("");
      if (boardFingerprint(localStateRef.current) === fingerprint) setStatus("synced");
      return result.committed;
    } catch (writeError) {
      setError(writeError.message || "Could not sync your board.");
      setStatus("error");
      throw writeError;
    } finally {
      outgoingRef.current.delete(fingerprint);
      writingRef.current = false;
      if (boardFingerprint(localStateRef.current) !== fingerprint && readyRef.current) {
        setSyncGeneration((generation) => generation + 1);
      }
    }
  }, [rememberBaseline, handleConflict]);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      if (nextUser) canImportRef.current = takeRedirectImportIntent() || canImportRef.current;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      readyRef.current = false;
      const baseline = nextUser ? loadSyncBaseline(nextUser.uid) : null;
      baselineRef.current = baseline?.fingerprint ?? null;
      baselineRevisionRef.current = baseline?.revision ?? 0;
      outgoingRef.current.clear();
      resolvingRef.current = false;
      writingRef.current = false;
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
              const committed = await writeBoard(user.uid, localStateRef.current);
              if (committed) markReady();
            } catch { /* writeBoard reports the error */ }
            return;
          }

          const remote = snapshot.data()?.state;
          const action = initialSyncAction(localStateRef.current, remote, baselineRef.current, baselineRevisionRef.current, canImportRef.current);
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
          handleConflict(user.uid, remote);
          return;
        }

        if (!snapshot.exists()) return;
        const remote = snapshot.data()?.state;
        const remoteFingerprint = boardFingerprint(remote);
        if (conflictRef.current || resolvingRef.current) {
          pendingRemoteRef.current = remote;
          return;
        }
        const action = incomingSyncAction(localStateRef.current, remote, baselineRef.current, baselineRevisionRef.current);
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
          handleConflict(user.uid, remote);
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
  }, [user, markReady, rememberBaseline, writeBoard, handleConflict]);

  useEffect(() => {
    if (!user || !firestore || !readyRef.current || conflict) return undefined;
    if (boardFingerprint(localState) === baselineRef.current || writingRef.current) return undefined;
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
    canImportRef.current = true;
    try {
      const provider = new GoogleAuthProvider();
      const mobileDevice = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
      const authHelperIsSameOrigin = window.location.hostname === import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
      if (mobileDevice && authHelperIsSameOrigin) {
        try { window.sessionStorage.setItem(IMPORT_INTENT_KEY, "true"); } catch { /* Account board is the safe default. */ }
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (signInError) {
      canImportRef.current = false;
      takeRedirectImportIntent();
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
      canImportRef.current = false;
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
      let resolved = selected;
      if (choice === "merge") {
        // Resolve against the exact cloud version the user reviewed. A newer
        // cloud edit stays in the dialog rather than being silently replaced.
        baselineRef.current = boardFingerprint(remote);
        const committed = await writeBoard(user.uid, selected);
        if (!committed) return;
        resolved = committed;
      }
      rememberBaseline(user.uid, resolved);
      applyRef.current(resolved);
      pendingRemoteRef.current = null;
      conflictRef.current = false;
      setConflict(false);
      markReady();
    } catch { /* Keep the choice dialog open so the merge is not lost. */ }
    finally { resolvingRef.current = false; }
  }, [user, markReady, rememberBaseline, writeBoard]);

  return { user, status, error, conflict, configured: firebaseConfigured, signIn, signOut: logOut, resolveConflict };
}
