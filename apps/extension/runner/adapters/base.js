(() => {
  const registry = (window.JobGeniusAdapters = window.JobGeniusAdapters || {});

  function registerAdapter(name, adapter) {
    registry[name] = adapter;
  }

  function getAdapter(name) {
    return registry[name];
  }

  function getAllAdapters() {
    return registry;
  }

  // Returns adapter by name, falling back to GENERIC if not found.
  function resolveAdapter(atsType) {
    return registry[atsType] || registry["GENERIC"] || null;
  }

  window.JobGeniusAdapterRegistry = {
    registerAdapter,
    getAdapter,
    getAllAdapters,
    resolveAdapter,
    // Version of the adapter bundle shipped with this extension. Bump this when
    // the per-ATS host/hint tables change so the server-side adapter_versions
    // comparison (see runner/index.js checkAdapterDrift) can flag a stale
    // extension. Keep in sync with the cloud runner's adapter tables.
    bundleVersion: "1",
  };
})();
