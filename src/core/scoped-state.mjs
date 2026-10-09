/** In-memory provenance. An old value cannot be blessed with a fresh permit. */
export class ScopedState {
  #lineage = new WeakMap();
  remember(value, context) { context.gateway.check(context); this.#lineage.set(value, context); return value; }
  check(value, context) {
    if (this.#lineage.get(value) !== context) throw new Error('Cached evidence has no matching lineage');
    context.gateway.check(context);
  }
}
