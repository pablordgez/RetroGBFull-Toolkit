let backendCount = 0;

export function incrementBackend() {
  backendCount += 1;
  return backendCount;
}

export function getBackendCount() {
  return backendCount;
}

export function resetBackend() {
  backendCount = 0;
}