const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  try {
    // Get the build directory
    const buildDir = context.buildDir || context.projectDir || __dirname.replace('/scripts', '');
    
    // Make Install.command executable
    const scriptPath = path.join(buildDir, 'scripts', 'Install.command');
    if (fs.existsSync(scriptPath)) {
      fs.chmodSync(scriptPath, 0o755);
      console.log('✅ Made Install.command executable');
    }
    
  } catch (e) {
    console.warn('⚠️ beforePack hook error:', e.message);
  }
};
