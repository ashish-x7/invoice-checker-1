
try {
   var f = new ActiveXObject('Scripting.FileSystemObject');
   var content = f.OpenTextFile('ajio/ajio.js', 1).ReadAll();
   var fn = new Function(content);
   WScript.Echo('Syntax OK');
} catch (e) {
   WScript.Echo('Line ' + e.line + ': ' + e.message);
}
