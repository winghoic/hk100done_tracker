import { firebaseConfig } from "./firebase-config.js";
import { cloudDocumentPlan, encodeFirestoreValue, normalizeState, toFirebaseAppConfig } from "./sync-model.js";

const FIREBASE_VERSION = "11.6.1";
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export async function createFirebaseBackend(config = firebaseConfig) {
    const [{ initializeApp }, authMod, firestoreMod] = await Promise.all([
        import(`${CDN}/firebase-app.js`),
        import(`${CDN}/firebase-auth.js`),
        import(`${CDN}/firebase-firestore.js`),
    ]);

    const app = initializeApp(toFirebaseAppConfig(config));
    const auth = authMod.getAuth(app);
    try {
        await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    } catch {
        // Private-mode storage can reject persistence. Sign-in still works for this tab.
    }
    const db = openFirestore(firestoreMod, app);

    return {
        async completeRedirect() {
            try {
                await authMod.getRedirectResult(auth);
                return { error: null };
            } catch (error) {
                return { error };
            }
        },
        onAuthStateChanged(callback) {
            return authMod.onAuthStateChanged(auth, callback);
        },
        async signInWithGoogle() {
            const provider = new authMod.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            await authMod.signInWithPopup(auth, provider);
        },
        async signInWithRedirect() {
            const provider = new authMod.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            await authMod.signInWithRedirect(auth, provider);
        },
        async signOut() {
            await authMod.signOut(auth);
        },
        async readCloud(uid) {
            const progressSnap = await firestoreMod.getDoc(firestoreMod.doc(db, "users", uid, "tracker", "progress"));
            const hikesSnap = await firestoreMod.getDocs(firestoreMod.collection(db, "users", uid, "hikes"));
            const progress = progressSnap.exists() ? progressSnap.data() : {};
            const hikes = [];
            hikesSnap.forEach((entry) => {
                hikes.push({ id: entry.id, ...entry.data() });
            });
            return normalizeState({ ...progress, hikes });
        },
        async writeBackup(uid, backup) {
            const backupId = `backup_${backup.createdAt || Date.now()}`;
            await firestoreMod.setDoc(
                firestoreMod.doc(db, "users", uid, "backups", backupId),
                encodeFirestoreValue(backup)
            );
        },
        async writeState(uid, state, { previousHikeIds = [], profile } = {}) {
            const plan = cloudDocumentPlan(uid, previousHikeIds, state);
            const ops = [];
            if (profile) ops.push({ type: "set", path: plan.profilePath, data: profile, merge: true });
            ops.push({ type: "set", path: plan.progressPath, data: plan.progress, merge: true });
            for (const hike of plan.hikes) ops.push({ type: "set", path: hike.path, data: hike.data, merge: true });
            for (const path of plan.deleteHikePaths) ops.push({ type: "delete", path });
            await commitOps(firestoreMod, db, ops);
        },
    };
}

function openFirestore(firestoreMod, app) {
    try {
        return firestoreMod.initializeFirestore(app, {
            localCache: firestoreMod.persistentLocalCache({
                tabManager: firestoreMod.persistentMultipleTabManager(),
            }),
        });
    } catch {
        try {
            return firestoreMod.initializeFirestore(app, {
                localCache: firestoreMod.persistentLocalCache(),
            });
        } catch {
            return firestoreMod.getFirestore(app);
        }
    }
}

async function commitOps(firestoreMod, db, ops) {
    const chunkSize = 400;
    for (let index = 0; index < ops.length; index += chunkSize) {
        const batch = firestoreMod.writeBatch(db);
        for (const op of ops.slice(index, index + chunkSize)) {
            const ref = firestoreMod.doc(db, ...op.path);
            if (op.type === "delete") batch.delete(ref);
            else batch.set(ref, encodeFirestoreValue(op.data), { merge: op.merge === true });
        }
        await batch.commit();
    }
}
