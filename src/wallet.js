const ADDRESS_RE = /^0x[a-f\d]{40}$/i;
const announcementCache = new WeakMap();

function providerName(provider, info, fallback) {
  if (info?.name) return info.name;
  if (provider?.isOkxWallet || provider?.isOKExWallet || provider?.isOKXWallet) return 'OKX Wallet';
  if (provider?.isMetaMask) return 'MetaMask';
  return fallback || 'Injected EVM Wallet';
}

export function collectInjectedWallets(target = globalThis.window) {
  if (!target) return [];
  const candidates = [];
  const add = (provider, info, fallback) => {
    if (!provider || typeof provider.request !== 'function' || candidates.some((item) => item.provider === provider)) return;
    candidates.push({ provider, name: providerName(provider, info, fallback), uuid: info?.uuid || null, rdns: info?.rdns || null });
  };

  // EIP-6963-aware wallets can coexist without competing for window.ethereum.
  for (const detail of announcementCache.get(target) || []) {
    add(detail.provider, detail.info, null);
  }
  add(target.okxwallet, null, 'OKX Wallet');
  const legacy = target.ethereum;
  if (Array.isArray(legacy?.providers)) {
    legacy.providers.forEach((provider) => add(provider));
  } else {
    add(legacy);
  }
  return candidates;
}

export function listenForEip6963Wallets(target = globalThis.window, onChange = () => {}) {
  if (!target?.addEventListener || !target?.dispatchEvent) return () => {};
  const announcements = new Map();
  const onAnnouncement = (event) => {
    const detail = event.detail;
    if (!detail?.provider || typeof detail.provider.request !== 'function') return;
    const key = detail.info?.uuid || detail.provider;
    announcements.set(key, detail);
    announcementCache.set(target, [...announcements.values()]);
    onChange(collectInjectedWallets(target));
  };
  target.addEventListener('eip6963:announceProvider', onAnnouncement);
  target.dispatchEvent(new Event('eip6963:requestProvider'));
  return () => target.removeEventListener('eip6963:announceProvider', onAnnouncement);
}

export async function requestEvmWalletAccount(provider) {
  if (!provider || typeof provider.request !== 'function') throw new Error('The selected wallet provider is unavailable.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || !ADDRESS_RE.test(accounts[0] || '')) throw new Error('The wallet returned no valid EVM account.');
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (typeof chainId !== 'string' || !/^0x[0-9a-f]+$/i.test(chainId)) throw new Error('The wallet returned an invalid chain ID.');
  return { address: accounts[0], chainId };
}
