// Détection du format d'image réel par lecture des magic bytes.
// Le Content-Type déclaré par le navigateur n'est JAMAIS considéré comme
// fiable : toutes les validations importantes utilisent le contenu réel.

export type DetectedImageKind =
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "gif"
  | "svg"
  | "unknown";

function asciiAt(input: Buffer, offset: number, length: number): string {
  return input.subarray(offset, offset + length).toString("latin1");
}

function looksLikeSvg(input: Buffer): boolean {
  // Le prologue XML / doctype / commentaires peuvent précéder la balise racine.
  const head = input.subarray(0, Math.min(input.length, 4096)).toString("utf8").toLowerCase();
  return head.includes("<svg") && head.includes("http://www.w3.org/2000/svg");
}

/** Détecte le format d'image réel d'un buffer (magic bytes), ou "unknown". */
export function detectImageKind(input: Buffer): DetectedImageKind {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff) {
    return "jpeg";
  }
  if (
    input.length >= 8 &&
    input[0] === 0x89 &&
    input[1] === 0x50 &&
    input[2] === 0x4e &&
    input[3] === 0x47 &&
    input[4] === 0x0d &&
    input[5] === 0x0a &&
    input[6] === 0x1a &&
    input[7] === 0x0a
  ) {
    return "png";
  }
  if (input.length >= 12 && asciiAt(input, 0, 4) === "RIFF" && asciiAt(input, 8, 4) === "WEBP") {
    return "webp";
  }
  if (input.length >= 12 && asciiAt(input, 4, 4) === "ftyp") {
    const brand = asciiAt(input, 8, 4);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  if (input.length >= 6 && asciiAt(input, 0, 3) === "GIF") return "gif";
  if (looksLikeSvg(input)) return "svg";
  return "unknown";
}
