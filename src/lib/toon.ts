export function jsonToToon(data: any, indentLevel: number = 0): string {
    const indent = '  '.repeat(indentLevel);

    if (data === null) return 'null';
    if (data === undefined) return 'undefined';

    // Primitives
    if (typeof data !== 'object') {
        return JSON.stringify(data);
    }

    // Dates
    if (data instanceof Date) {
        return data.toISOString();
    }

    // Arrays
    if (Array.isArray(data)) {
        if (data.length === 0) return '[]';

        // Check if it's a uniform array of objects for tabular format
        if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
            const keys = Object.keys(data[0]);
            const isUniform = data.every(item =>
                typeof item === 'object' &&
                item !== null &&
                !Array.isArray(item) &&
                arraysEqual(Object.keys(item), keys)
            );

            if (isUniform && keys.length > 0) {
                // Tabular format: [count]{keys}: values
                // We will render it as a block to be cleaner
                // But typically TOON for arrays is often just the values if inline, or indented block.
                // Let's stick to a robust representation.
                // "root[count]{key1,key2}:"
                //   val1, val2
                //   val3, val4
                // However, since we are returning a string for a value, if this is called recursively, we need to handle the parent key.
                // This function returns the VALUE string.

                const header = `[${data.length}]{${keys.join(',')}}:`;
                const rows = data.map(item => {
                    return keys.map(k => {
                        const val = item[k];
                        if (typeof val === 'object' && val !== null) {
                            // Simplified representation for nested objects in table to avoid complex nesting
                            return JSON.stringify(val);
                        }
                        return String(val).replace(/,/g, '\\,'); // Escape commas
                    }).join(', ');
                });

                return `${header}\n${indent}  ${rows.join(`\n${indent}  `)}`;
            }
        }

        // Regular array
        const currentIndent = '  '.repeat(indentLevel);
        return data.map(item => {
            const itemVal = jsonToToon(item, indentLevel + 1);
            // If item is an object/array, it will have its own indentation (level+1).
            // We trim the start to place the bullet "- " correctly.
            // For multi-line objects, the subsequent lines are already indented at level+1.
            return `${currentIndent}- ${itemVal.trimStart()}`;
        }).join('\n');
    }

    // Objects
    const lines: string[] = [];
    for (const [key, value] of Object.entries(data)) {
        const valueStr = jsonToToon(value, indentLevel + 1);

        if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value) && valueStr.startsWith('[')) {
                // Tabular format
                lines.push(`${indent}${key}${valueStr}`);
            } else {
                // Nested Object or Regular Array
                lines.push(`${indent}${key}:\n${valueStr}`);
            }
        } else {
            lines.push(`${indent}${key}: ${valueStr}`);
        }
    }
    return lines.join('\n');
}

function arraysEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
}
