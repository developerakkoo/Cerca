/**
 * Version comparison utility for semantic versioning
 * Supports versions in format: major.minor.patch (e.g., "1.2.3")
 */

/**
 * Compare two semantic versions
 * @param current Current version string (e.g., "1.2.3")
 * @param required Required version string (e.g., "1.2.4")
 * @returns -1 if current < required, 0 if equal, 1 if current > required
 */
export function compareVersions(current: string, required: string): number {
  if (!current || !required) {
    return 0; // If either is missing, assume equal (fail open)
  }

  // Normalize versions (remove any leading/trailing whitespace)
  const currentNormalized = current.trim();
  const requiredNormalized = required.trim();

  // Split versions into parts
  const currentParts = currentNormalized.split('.').map(part => parseInt(part, 10) || 0);
  const requiredParts = requiredNormalized.split('.').map(part => parseInt(part, 10) || 0);

  // Ensure both arrays have at least 3 parts (major.minor.patch)
  while (currentParts.length < 3) {
    currentParts.push(0);
  }
  while (requiredParts.length < 3) {
    requiredParts.push(0);
  }

  // Compare major version
  if (currentParts[0] !== requiredParts[0]) {
    return currentParts[0] > requiredParts[0] ? 1 : -1;
  }

  // Compare minor version
  if (currentParts[1] !== requiredParts[1]) {
    return currentParts[1] > requiredParts[1] ? 1 : -1;
  }

  // Compare patch version
  if (currentParts[2] !== requiredParts[2]) {
    return currentParts[2] > requiredParts[2] ? 1 : -1;
  }

  // Versions are equal
  return 0;
}

/**
 * Check if current version is less than required version
 * @param current Current version string
 * @param required Required version string
 * @returns true if update is required
 */
export function isUpdateRequired(current: string, required: string): boolean {
  return compareVersions(current, required) < 0;
}

