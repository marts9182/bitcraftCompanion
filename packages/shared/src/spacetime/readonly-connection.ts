import {
  DbConnectionBuilder,
  DbConnectionImpl,
  type ErrorContextInterface,
} from "@clockworklabs/spacetimedb-sdk";

export interface ReadOnlyConfig {
  uri: string;
  moduleName: string;
  token: string;
}

type RowHandler = (table: string, row: unknown) => void;

/**
 * The base `@clockworklabs/spacetimedb-sdk` package does NOT ship a concrete
 * `DbConnection` class — that class (with its static `.builder()`, typed `.db`
 * table handles and `.reducers`) is normally code-generated per module via the
 * `spacetime generate` CLI. The base SDK exposes only the generic primitives
 * `DbConnectionBuilder`, `DbConnectionImpl` and `SubscriptionBuilderImpl`.
 *
 * Until module bindings are generated (a later task), we drive the generic
 * builder directly with a minimal remote module. The builder's fluent methods
 * (`withUri`, `withModuleName`, `withToken`, `onConnect`, `onConnectError`,
 * `onDisconnect`, `build`) match the plan's intended API 1:1.
 *
 * Crucially: `DbConnectionImpl` does expose `callReducer`/`reducers`, but this
 * wrapper NEVER surfaces or invokes them. The public surface below is read-only.
 */
type SpacetimeBuilder = DbConnectionBuilder<
  DbConnectionImpl,
  ErrorContextInterface,
  unknown
>;

/** Minimal no-op remote module: no tables, no reducers. Replaced by generated
 * bindings once `spacetime generate` is run for the BitCraft module. */
const EMPTY_REMOTE_MODULE = {
  tables: {},
  reducers: {},
  eventContextConstructor: (imp: DbConnectionImpl, event: unknown) => ({ ...imp, event }),
  dbViewConstructor: (connection: DbConnectionImpl) => connection.db,
  reducersConstructor: (connection: DbConnectionImpl) => connection.reducers,
  setReducerFlagsConstructor: () => ({}),
};

function newBuilder(): SpacetimeBuilder {
  // The builder is constructed with (remoteModule, dbConnectionConstructor).
  // We hand back the DbConnectionImpl itself as the "DbConnection".
  return new DbConnectionBuilder(
    EMPTY_REMOTE_MODULE as unknown as ConstructorParameters<typeof DbConnectionBuilder>[0],
    (imp: DbConnectionImpl) => imp,
  ) as unknown as SpacetimeBuilder;
}

/**
 * Read-only SpacetimeDB connection. By design this class exposes NO method to
 * call a reducer — the only mutation path in SpacetimeDB — so it cannot affect
 * the live game. It can only connect and subscribe to table data.
 */
export class ReadOnlySpacetime {
  #conn: DbConnectionImpl | undefined;
  #connected = false;

  constructor(private readonly config: ReadOnlyConfig) {}

  isConnected(): boolean {
    return this.#connected;
  }

  connect(handlers: { onConnect?: () => void; onError?: (e: unknown) => void } = {}): void {
    this.#conn = newBuilder()
      .withUri(this.config.uri)
      .withModuleName(this.config.moduleName)
      .withToken(this.config.token)
      .onConnect(() => {
        this.#connected = true;
        handlers.onConnect?.();
      })
      .onConnectError((_ctx, err) => handlers.onError?.(err))
      .onDisconnect(() => {
        this.#connected = false;
      })
      .build();
  }

  onConnect(cb: () => void): void {
    // convenience for callers that connect() before registering
    if (this.#connected) cb();
  }

  onError(_cb: (e: unknown) => void): void {
    // reserved: error routing is wired in connect(); kept for API symmetry
  }

  /**
   * Subscribe (read-only) to one or more SQL subscription queries and receive
   * inserted/updated rows. Never issues a reducer call.
   */
  subscribe(queries: string[], onRow: RowHandler): void {
    if (!this.#conn) throw new Error("connect() must be called before subscribe()");
    this.#conn
      .subscriptionBuilder()
      .onApplied(() => {
        /* initial snapshot applied */
      })
      .subscribe(queries);

    // Generic row routing across all tables exposed on conn.db.
    const db = this.#conn.db as unknown as Record<string, { onInsert?: Function; onUpdate?: Function }>;
    for (const [table, handle] of Object.entries(db)) {
      handle.onInsert?.((_ctx: unknown, row: unknown) => onRow(table, row));
      handle.onUpdate?.((_ctx: unknown, _old: unknown, row: unknown) => onRow(table, row));
    }
  }

  disconnect(): void {
    this.#conn?.disconnect?.();
    this.#connected = false;
  }
}
