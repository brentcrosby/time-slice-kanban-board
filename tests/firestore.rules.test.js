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
    };
    const validDocument = () => ({ state: validState, updatedAt: serverTimestamp() });

    await assertSucceeds(setDoc(ownerRef, validDocument()));
    await assertSucceeds(getDoc(ownerRef));
    await assertFails(getDoc(doc(other.firestore(), ...path)));
    await assertFails(getDoc(doc(guest.firestore(), ...path)));
    await assertFails(setDoc(doc(other.firestore(), ...path), validDocument()));
    await assertFails(setDoc(doc(owner.firestore(), "users", "owner", "tasky", "other"), validDocument()));
    await assertFails(deleteDoc(ownerRef));

    await assertFails(setDoc(ownerRef, { updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ownerRef, { state: { ...validState, autoMoveEnabled: "yes" }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ownerRef, { state: { ...validState, cardsByCol: { todo: [], doing: [] } }, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ownerRef, { ...validDocument(), admin: true }));
    await assertFails(setDoc(ownerRef, { state: validState, updatedAt: new Date() }));
  } finally {
    await environment.cleanup();
  }
});
