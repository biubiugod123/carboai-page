// Inserts WORD JOINER (U+2060) between adjacent CJK ideographs so headlines
// only wrap at punctuation. Usage as CLI: node tools/cjk-joiner.mjs '中文标题'
const CJK = /[一-鿿㐀-䶿]/;
export function joinCjk(s) {
  const clean = s.replace(/⁠/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 1) {
    out += clean[i];
    if (i + 1 < clean.length && CJK.test(clean[i]) && CJK.test(clean[i + 1])) out += '⁠';
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(joinCjk(process.argv.slice(2).join(' ')) + '\n');
