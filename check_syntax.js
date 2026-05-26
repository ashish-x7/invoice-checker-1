const fs = require('fs');
const content = fs.readFileSync('ajio/ajio.js', 'utf8');
try {
    new Function(content);
    console.log('No syntax errors found.');
} catch (e) {
    console.error('Syntax Error found:');
    console.error(e.message);
    const stack = e.stack.split('\n');
    console.error(stack[0]);
    // Try to find the line number if available in stack
}
