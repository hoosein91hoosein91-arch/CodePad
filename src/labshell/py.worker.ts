// Canonical engine. Queue messages while its dynamic module is loading.
const pending: MessageEvent[] = [];
self.onmessage = (event: MessageEvent) => pending.push(event);
void import(/* @vite-ignore */ `${self.location.origin}/background/python-worker.js`).then(() => {
  const handler = self.onmessage;
  for (const event of pending.splice(0)) handler?.call(self, event);
}).catch(error => {
  for (const event of pending.splice(0)) self.postMessage({ id: event.data.id, stdout: "", stderr: String(error), done: true });
});
export {};
