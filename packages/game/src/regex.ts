/**
 * JavaScript's `\b` is ASCII-only: between a space and "н" there is no word
 * boundary at all, so `/\bнужно\b/` silently never matches Russian text. Every
 * heuristic in this package therefore goes through {@link rx}, which swaps
 * `\b` for a Unicode-aware equivalent and compiles with the `u` flag.
 */
const UNICODE_BOUNDARY =
  "(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))";

export function rx(source: string, flags = "iu"): RegExp {
  return new RegExp(source.replaceAll("\\b", UNICODE_BOUNDARY), flags);
}
