const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const out=path.join(__dirname,'docs');fs.mkdirSync(path.join(out,'assets'),{recursive:true});
const result=esbuild.buildSync({entryPoints:[path.join(__dirname,'src/runner.js')],bundle:true,minify:true,write:false,format:'iife',target:'es2020'});
const template=fs.readFileSync(path.join(__dirname,'src/shell.html'),'utf8').replace('__RELEASE_CSS__',()=>fs.readFileSync(path.join(__dirname,'src/release-ui.css'),'utf8'));
fs.writeFileSync(path.join(out,'index.html'),template.replace('__MODEL__','').replace('__SCRIPT__','<script src="./assets/runner.js" defer></script>'));
fs.writeFileSync(path.join(out,'assets/runner.js'),result.outputFiles[0].text.replaceAll('</script','<\\/script'));
fs.copyFileSync(path.join(__dirname,'assets/golden-character-v08.glb'),path.join(out,'assets/golden-character-v08.glb'));
fs.writeFileSync(path.join(out,'.nojekyll'),'');fs.copyFileSync(path.join(__dirname,'node_modules/three/LICENSE'),path.join(out,'THREE-LICENSE.txt'));
console.log('Built GitHub Pages site in docs/');
