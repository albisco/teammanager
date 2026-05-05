export type VotingSchemeOk = { ok: true; value: number[] };
export type VotingSchemeErr = { ok: false; message: string };
export type VotingSchemeResult = VotingSchemeOk | VotingSchemeErr;

/**
 * Parse and validate a comma-separated voting scheme string.
 * @param input       Raw string from a form field (e.g. "5, 4, 3, 2, 1")
 * @param maxVotesPerRound  When supplied, scheme length must be >= this value
 */
export function parseVotingScheme(
  input: string,
  maxVotesPerRound?: number
): VotingSchemeResult {
  const err = (message: string): VotingSchemeErr => ({ ok: false, message });

  if (!input || !input.trim()) {
    return err("Voting scheme must not be empty.");
  }

  const raw = input.trim();

  // Reject leading or trailing commas
  if (raw.startsWith(",") || raw.endsWith(",")) {
    return err("Voting scheme must not have leading or trailing commas.");
  }

  const tokens = raw.split(",").map((t) => t.trim());

  const numbers: number[] = [];
  for (const token of tokens) {
    if (!token) {
      return err("Voting scheme must not have leading or trailing commas.");
    }
    if (!/^\d+$/.test(token)) {
      return err(
        `"${token}" is not a valid positive integer.`
      );
    }
    const n = parseInt(token, 10);
    if (n <= 0) {
      return err(`Each value must be a positive integer, got ${n}.`);
    }
    numbers.push(n);
  }

  if (numbers.length === 0) {
    return err("Voting scheme must not be empty.");
  }

  if (numbers.length > 10) {
    return err("Voting scheme must have at most 10 entries.");
  }

  // Check strictly descending
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] >= numbers[i - 1]) {
      return err("Voting scheme values must be strictly descending (e.g. 5, 4, 3, 2, 1).");
    }
  }

  // No duplicates — already implied by strictly descending, but explicit check is clearer
  const seen = new Set<number>();
  for (const n of numbers) {
    if (seen.has(n)) {
      return err("Voting scheme must not contain duplicate values.");
    }
    seen.add(n);
  }

  if (maxVotesPerRound !== undefined && numbers.length < maxVotesPerRound) {
    return err(
      `Voting scheme length must be at least ${maxVotesPerRound} (the max votes per round).`
    );
  }

  return { ok: true, value: numbers };
}
