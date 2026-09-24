import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, firebaseConfigured, firestore } from "../utils/firebase";

const hasTasks = (state) => Object.values(state?.cardsByCol || {}).some((cards) => cards?.length);

const mergeBoards = (local, remote) => {
  const cardsByCol = {};
  const remoteIds = new Set(Object.values(remote?.cardsByCol || {}).flat().map((card) => card.id));
  const ids = new Set(remoteIds);
  for (const columnId of ["todo", "doing", "done"]) {
    const remoteCards = remote?.cardsByCol?.[columnId] || [];
    const localCards = local?.cardsByCol?.[columnId] || [];
    cardsByCol[columnId] = [...remoteCards, ...localCards.filter((card) => !ids.has(card.id))];
    localCards.forEach((card) => ids.add(card.id));
  }
  return { cardsByCol, autoMoveEnabled: remote?.autoMoveEnabled ?? local?.autoMoveEnabled ?? true };
};

export function useTaskSync(localState, onApplyState) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(firebaseConfigured ? "signed-out" : "unconfigured");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const pendingRemoteRef = useRef(null);
  const readyRef = useRef(false);
  const applyingRef = useRef(false);
  const localStateRef = useRef(localState);
  const applyRef = useRef(onApplyState);
  const unsubscribeRef = useRef(null);

  localStateRef.current = localState;
  applyRef.current = onApplyState;

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (nextUser) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      readyRef.current = false;
      pendingRemoteRef.current = null;
      setConflict(false);
      setError("");
      setUser(nextUser);
      setStatus(nextUser ? "connecting" : "signed-out");
    });
  }, []);

  useEffect(() => {
    if (!user || !firestore) return undefined;
    const stateRef = doc(firestore, "users", user.uid, "tasky", "state");
    let firstSnapshot = true;
    const unsubscribe = onSnapshot(
      stateRef,
      async (snapshot) => {
        if (firstSnapshot) {
          firstSnapshot = false;
          if (!snapshot.exists()) {
            try {
              await setDoc(stateRef, { state: localStateRef.current, updatedAt: serverTimestamp() });
              readyRef.current = true;
              setStatus("synced");
            } catch (writeError) {
              setError(writeError.message || "Could not create your synced board.");
              setStatus("error");
            }
            return;
          }

          const remote = snapshot.data()?.state;
          if (hasTasks(localStateRef.current) && JSON.stringify(remote) !== JSON.stringify(localStateRef.current)) {
            pendingRemoteRef.current = remote;
            setConflict(true);
            setStatus("needs-choice");
            return;
          }
          applyingRef.current = true;
          applyRef.current(remote);
          queueMicrotask(() => { applyingRef.current = false; });
          readyRef.current = true;
          setStatus("synced");
          return;
        }

        if (!snapshot.exists()) return;
        const remote = snapshot.data()?.state;
        if (JSON.stringify(remote) !== JSON.stringify(localStateRef.current)) {
          applyingRef.current = true;
          applyRef.current(remote);
          queueMicrotask(() => { applyingRef.current = false; });
        }
        setStatus("synced");
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
  }, [user]);

  useEffect(() => {
    if (!user || !firestore || !readyRef.current || conflict || applyingRef.current) return undefined;
    const timeout = window.setTimeout(async () => {
      try {
        const stateRef = doc(firestore, "users", user.uid, "tasky", "state");
        await setDoc(stateRef, { state: localState, updatedAt: serverTimestamp() });
        setError("");
        setStatus("synced");
      } catch (writeError) {
        setError(writeError.message || "Could not sync your board.");
        setStatus("error");
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [user, localState, conflict]);

  const signIn = useCallback(async () => {
    if (!auth) return;
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      if (window.matchMedia("(max-width: 767px), (pointer: coarse)").matches) {
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
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (signOutError) {
      setError(signOutError.message || "Could not sign out.");
    }
  }, []);

  const resolveConflict = useCallback((choice) => {
    const remote = pendingRemoteRef.current;
    if (!remote) return;
    const selected = choice === "merge" ? mergeBoards(localStateRef.current, remote) : remote;
    applyingRef.current = true;
    applyRef.current(selected);
    pendingRemoteRef.current = null;
    setConflict(false);
    readyRef.current = true;
    queueMicrotask(() => { applyingRef.current = false; });
    setStatus("synced");
  }, []);

  return { user, status, error, conflict, configured: firebaseConfigured, signIn, signOut: logOut, resolveConflict };
}
