let internalCounter = 0;

export function getCount() {
  return internalCounter;
}

export function incrementCounter() {
  internalCounter++;
  return internalCounter;
}

export function resetCounter() {
  internalCounter = 0;
}