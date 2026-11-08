# FSRS training WASM

The upstream 0.6.0 JavaScript loader runs this WASI Preview 1 module, which adds the optional `disableRecencyWeighting` training flag. Remove the module and patches when the upstream binding exposes equivalent control.

Check out ts-fsrs at `b69d6ca2dca55579198c913fd55a43d6bf703b34` and ishiko732/fsrs-rs at `d7f337b7c3d4f85aff4b523baa077b529cee1005` in sibling directories named `binding` and `optimizer`. Apply `binding.patch` and `optimizer.patch` in their respective checkouts with `git apply --unidiff-zero`.

Use Rust 1.99.1 with the `wasm32-wasip1` target. Extract `emnapi@2.0.0-beta.2` from npm and set `EMNAPI_LINK_DIR` to its absolute `package/lib/wasm32-wasip1` directory. From the binding checkout run:

```sh
cargo build --locked --release --target wasm32-wasip1 --config 'patch."https://github.com/ishiko732/fsrs-rs".fsrs.path="../optimizer"'
```

Copy `target/wasm32-wasip1/release/fsrs_binding.wasm` to `fsrs-training.wasm` in this directory.
