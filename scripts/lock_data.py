"""Encrypt the site's data with the league password.

The public repo only ever holds the encrypted files.  The plain files live in a
private folder (D:\\Eric\\Pinche\\private\\site-data) and never go to GitHub.

  python3 lock_data.py <private src folder> <repo data folder> "<league password>"

Writes data/lock.json (salt + a check value) and one .enc file per data file.
AES-256-GCM, key from PBKDF2-SHA256.  Rerun with a new password to change it.
"""
import base64, json, os, pathlib, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 250_000
b64 = lambda b: base64.b64encode(b).decode()


def key_for(password, salt):
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode())


def seal(key, data: bytes):
    iv = os.urandom(12)
    return {"iv": b64(iv), "ct": b64(AESGCM(key).encrypt(iv, data, None))}


def main(src, out, password):
    src, out = pathlib.Path(src), pathlib.Path(out)
    salt = os.urandom(16)
    key = key_for(password, salt)
    out.mkdir(parents=True, exist_ok=True)
    for old in list(out.glob("*.json")) + list(out.glob("*.enc")):
        old.unlink()
    (out / "lock.json").write_text(json.dumps({"v": 1, "iter": ITER, "salt": b64(salt), "check": seal(key, b"pinche")}))
    # keepers photo travels inside the encrypted keepers file
    keepers = json.loads((src / "keepers.json").read_text())
    for y in keepers.get("years", []):
        ph = y.get("photo")
        if ph and not ph["src"].startswith("data:"):
            img = src / pathlib.Path(ph["src"]).name
            ph["src"] = "data:image/jpeg;base64," + b64(img.read_bytes())
    files = {
        "league": json.loads((src / "league.json").read_text()),
        "history": json.loads((src / "history.json").read_text()),
        "partners": json.loads((src / "partners.json").read_text()),
        "keepers": keepers,
        "rules": (src / "rules.html").read_text(),
    }
    for name, obj in files.items():
        raw = obj.encode() if isinstance(obj, str) else json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
        (out / f"{name}.enc").write_text(json.dumps(seal(key, raw)))
    print("locked:", ", ".join(sorted(files)))


if __name__ == "__main__":
    main(*sys.argv[1:4])
