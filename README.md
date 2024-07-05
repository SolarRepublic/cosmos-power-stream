# Cosmos WebSocket Multiplexer

> Enables Cosmos node providers to reduce Tendermint/CometBFT event subscription loads on their RPC nodes by placing a set of these WebSocket multiplexers between the node and their clients, scaling elastically as needed.


### What?

Blockchains built on the Tendermint/CometBFT stack (i.e., Cosmos-SDK) have a powerful built-in feature on nodes' public-facing RPC ports, a real-time event stream at the `/websocket` endpoint behind the JSON-RPC `"subscribe"` method. It streams data to clients including about new blocks and committed transactions as they occur. These push events allow clients to receive information from the chain, including for transaction broadcast confirmations, much quicker and more efficiently than polling the node with queries.

![Advantages of multiplexing](docs/multiplexing.png)


## Getting Started

Install:
```sh
bun install
```

Build:
```sh
bun run build
```

