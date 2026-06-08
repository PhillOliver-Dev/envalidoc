/**
 * Simple dotenv file parser.
 *
 * Handles: comments (#, //), quoted values (single and double),
 * empty lines, multiline (basic), inline comments after value.
 */

/**
 * Parse a .env file content string into a map of key-value pairs.
 */
export function parseDotEnv(content: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = content.split('\n');

  let currentKey: string | undefined;
  let currentValue: string | undefined;
  let multilineOpen: 'single' | 'double' | undefined;

  for (const rawLine of lines) {
    // If we are inside a multiline value, keep appending
    if (multilineOpen !== undefined && currentKey !== undefined && currentValue !== undefined) {
      if (multilineOpen === 'double' && rawLine.endsWith('"')) {
        // Closing double-quote line
        currentValue += '\n' + rawLine.slice(0, -1);
        result.set(currentKey, currentValue);
        currentKey = undefined;
        currentValue = undefined;
        multilineOpen = undefined;
      } else if (multilineOpen === 'single' && rawLine.endsWith("'")) {
        // Closing single-quote line
        currentValue += '\n' + rawLine.slice(0, -1);
        result.set(currentKey, currentValue);
        currentKey = undefined;
        currentValue = undefined;
        multilineOpen = undefined;
      } else {
        currentValue += '\n' + rawLine;
      }
      continue;
    }

    const trimmed = rawLine.trim();

    // Skip empty lines and comment-only lines
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }

    // Strip 'export ' prefix if present (common in bash export syntax)
    let keyLine = trimmed;
    let rawValue = trimmed;
    if (keyLine.startsWith('export ')) {
      keyLine = keyLine.slice(7).trim();
      // Also strip from the line we'll use for value extraction
      rawValue = keyLine;
    }

    // Find the first '=' that separates key from value
    const eqIndex = keyLine.indexOf('=');
    if (eqIndex === -1) {
      // No '=' found — skip lines without assignment
      continue;
    }

    const key = keyLine.slice(0, eqIndex).trim();
    if (key === '') {
      continue;
    }

    rawValue = rawValue.slice(eqIndex + 1);

    // Check for quoted values
    if (rawValue.startsWith('"')) {
      // Double-quoted value
      if (rawValue.endsWith('"') && rawValue.length > 1) {
        // Simple single-line quoted value
        rawValue = rawValue.slice(1, -1);
        // Unescape common sequences
        rawValue = rawValue.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
      } else if (!rawValue.includes('"')) {
        // Opening quote without closing — multiline
        currentKey = key;
        currentValue = rawValue.slice(1);
        multilineOpen = 'double';
        continue;
      } else {
        // Quote in the middle — take up to the closing quote
        const closeIdx = rawValue.indexOf('"', 1);
        if (closeIdx !== -1) {
          rawValue = rawValue.slice(1, closeIdx);
          rawValue = rawValue.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\\\/g, '\\');
        }
      }
    } else if (rawValue.startsWith("'")) {
      // Single-quoted value
      if (rawValue.endsWith("'") && rawValue.length > 1) {
        rawValue = rawValue.slice(1, -1);
      } else if (!rawValue.includes("'")) {
        // Opening quote without closing — multiline
        currentKey = key;
        currentValue = rawValue.slice(1);
        multilineOpen = 'single';
        continue;
      } else {
        const closeIdx = rawValue.indexOf("'", 1);
        if (closeIdx !== -1) {
          rawValue = rawValue.slice(1, closeIdx);
        }
      }
    } else {
      // Unquoted value — strip inline comments (# or // preceded by whitespace)
      rawValue = stripInlineComment(rawValue);
    }

    result.set(key, rawValue);
  }

  // If file ended while still in multiline, store what we have
  if (currentKey !== undefined && currentValue !== undefined) {
    result.set(currentKey, currentValue);
  }

  return result;
}

/**
 * Strip an inline comment (# or //) from an unquoted value.
 * A comment must be preceded by at least one whitespace character.
 */
function stripInlineComment(value: string): string {
  // Match # or // that is preceded by whitespace
  const hashMatch = value.match(/\s+#/);
  const slashMatch = value.match(/\s+\/\//);

  let commentIndex = -1;

  if (hashMatch?.index !== undefined) {
    commentIndex = hashMatch.index;
  }
  if (slashMatch?.index !== undefined) {
    if (commentIndex === -1 || slashMatch.index < commentIndex) {
      commentIndex = slashMatch.index;
    }
  }

  if (commentIndex !== -1) {
    return value.slice(0, commentIndex).trimEnd();
  }

  return value.trimEnd();
}
