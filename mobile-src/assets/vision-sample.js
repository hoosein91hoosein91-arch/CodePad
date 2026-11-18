// Explicit import only: never replace the user's active file on page load.
function attach() {
  const header = document.querySelector('main > header');
  if(!header)return false;
  if(header.querySelector('[data-vision-sample]'))return true;
  const button = document.createElement('button'); button.type = 'button'; button.dataset.visionSample = '';
  button.className = 'codepad-background-status'; button.textContent = 'دوربین و 3D'; button.title = 'باز کردن کد اصلی کنترل ذرات با دست در یک پروژهٔ جدید';
  button.onclick = async () => {
    button.disabled = true;
    try {
      const [runtime, response] = await Promise.all([import('./runtime.js'), fetch(new URL('../examples/space_gesture.py', import.meta.url))]);
      if (!response.ok) throw Error('کد نمونه پیدا نشد.');
      const content = await response.text();
      runtime.pt.getState().importProject('کنترل ذرات با دست', [{ name: 'space_gesture.py', lang: 'python', content }]);
      if (location.pathname === '/launcher') location.assign('/');
    } catch (error) { console.error(error); window.alert(error.message); }
    finally { button.disabled = false; }
  };
  header.append(button);return true;
}
if(!attach()){const observer=new MutationObserver(()=>{if(attach())observer.disconnect();});observer.observe(document.documentElement,{childList:true,subtree:true});}
