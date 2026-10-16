/* The native server supplies its own API; static hosting uses a same-origin
   service worker solely to enable the solver's SharedArrayBuffer threads. */
window.coi = {
  shouldRegister: () => !['127.0.0.1', 'localhost'].includes(location.hostname) || new URL(location.href).searchParams.get('runtime') === 'browser',
  coepCredentialless: () => false,
  coepDegrade: () => false,
  quiet: true
};
