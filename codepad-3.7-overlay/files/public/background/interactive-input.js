// Each request owns one continuation. Replies cannot start or replay a job.
export function interactiveInput(post, getId, flush = () => {}) {
  let sequence = 0;
  const waiting = new Map();
  return {
    request(prompt) {
      if (!WebAssembly.Suspending || !WebAssembly.promising)
        return Promise.reject(Error('ورودی زنده در مرورگر به WebView / Chrome 137 یا جدیدتر نیاز دارد؛ پایتون داخلی نسخهٔ Android این محدودیت را ندارد.'));
      flush();
      const requestId = ++sequence, id = getId();
      return new Promise(resolve => {
        waiting.set(requestId, {id, resolve});
        post({id, inputRequest:true, requestId, prompt:String(prompt)});
      });
    },
    reply(data) {
      if (!data.inputReply) return false;
      const item = waiting.get(data.requestId);
      if (item && item.id === data.id) {
        waiting.delete(data.requestId);
        item.resolve(data.eof ? null : String(data.value ?? ''));
      }
      return true;
    }
  };
}

export async function installInteractiveInput(py, input, prefill = '') {
  const response = await fetch(new URL('codepad_console.py', import.meta.url));
  if (!response.ok) throw Error('فایل ورودی Python همراه برنامه پیدا نشد.');
  py.FS.writeFile('/tmp/codepad_console.py', await response.text());
  const graphics=await fetch(new URL('codepad.py',import.meta.url));if(!graphics.ok)throw Error('فایل خروجی گرافیکی پیدا نشد.');py.FS.writeFile('/tmp/codepad.py',await graphics.text());try{const g3=await fetch(new URL('codepad3d.py',import.meta.url));if(g3.ok)py.FS.writeFile('/tmp/codepad3d.py',await g3.text());}catch(e){}
  py.globals.set('_codepad_display_image',json=>self.postMessage({id:undefined,image:JSON.parse(json)}));
  py.globals.set('_codepad_read_input', prompt => input.request(prompt).then(value=>JSON.stringify({value,eof:value===null})));
  py.globals.set('_codepad_prefill', prefill);
  py.runPython(`
import sys, json
if '/tmp' not in sys.path: sys.path.append('/tmp')
import codepad
def _codepad_display(json): return _codepad_display_image(json)
codepad._display = _codepad_display
from codepad_console import install_input
from pyodide.ffi import run_sync
def _codepad_read_line(prompt):
    answer=json.loads(run_sync(_codepad_read_input(prompt)))
    return None if answer["eof"] else answer["value"]
install_input(_codepad_read_line, _codepad_prefill)
`);
}
