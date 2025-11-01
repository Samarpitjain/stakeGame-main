import crypto from "crypto";

const serverSeed = "ca71ba5e5c15b232b566fb89c3f3ebdc";
const clientSeed = "ansh123";
const combinedSeed = `${serverSeed}:${clientSeed}`;

const hash = crypto.createHash("sha256").update(combinedSeed).digest("hex");
console.log("Combined Seed Hash:", hash);

