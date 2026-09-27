import { readFileSync } from "node:fs";
import test from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

test("Tasky board rules isolate owners and reject malformed writes", async () => {
  const environment = await initializeTestEnvironment({
    projectId: "demo-tasky",
    firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") },
  });

  try {
    const owner = environment.authenticatedContext("owner");
    const other = environment.authenticatedContext("other");
    const guest = environment.unauthenticatedContext();
    const path = ["users", "owner", "tasky", "state"];
    const ownerRef = doc(owner.firestore(), ...path);
    const validState = {
      cardsByCol: { todo: [], doing: [], done: [] },
      autoMoveEnabled: true,
      archivedCards: [],
      syncRevision: 1,
    };
    const validDocument = () => ({ state: validState, updatedAt: serverTimestamp() });

    await assertSucceeds(setDoc(ownerRef, validDocument()));
    await assertSucceeds(getDoc(ownerRef));
    await assertSucceeds(setDoc(ownerRef, {
      state: { ...validState, archivedCards: [{ id: "archived", title: "Finished" }], syncRevision: 2 },
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(ownerRef, {
      state: { cardsByCol: validState.cardsByCol, autoMoveEnabled: true, syncRevision: 3 },
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(ownerRef, {
      state: { ...validState, syncRevision: 2 },
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(ownerRef, {
      state: { cardsByCol: validState.cardsByCol, autoMoveEnabled: true },
      updatedAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(other.firestore(), ...path)));
    await assertFails(getDoc(doc(guest.firestore(), ...path)));
    await assertFails(setDoc(doc(other.firestore(), ...path), validDocument()));
    await assertFails(setDoc(doc(owner.firestore(), "users", "owner", "tasky", "other"), validDocument()));
    await assertFails(deleteDoc(ownerRef));

    await assertFails(setDoc(ownerRef, { updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ownerRef, { state: { ...validState, autoMoveEnabled: "yes" }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ownerRef, { state: { ...validState, archivedCards: {} }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ownerRef, { state: { ...validState, cardsByCol: { todo: [], doing: [] } }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ownerRef, { ...validDocument(), admin: true }));
    await assertFails(setDoc(ownerRef, { state: { ...validState, syncRevision: 4 }, updatedAt: new Date() }));

    // Boards saved by previous releases have no revision. The first new
    // client must be able to migrate them, while old clients cannot write back.
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), ...path), {
        state: { cardsByCol: validState.cardsByCol, autoMoveEnabled: true },
        updatedAt: new Date(),
      });
    });
    await assertSucceeds(setDoc(ownerRef, validDocument()));
    await assertFails(setDoc(ownerRef, {
      state: { cardsByCol: validState.cardsByCol, autoMoveEnabled: true },
      updatedAt: serverTimestamp(),
    }));
  } finally {
    await environment.cleanup();
  }
});
