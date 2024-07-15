# Cosmos Power Stream

> TLDR; sits in-between Cosmos RPC node and clients, indexing all Tendermint/CometBFT events emitted by the node [over WebSocket](https://docs.cometbft.com/v0.38/core/subscription) and multiplexing WebSocket subscriptions between node and clients.

## Features
 - Reduces load on Cosmos node providers' RPC nodes and allows scaling out using simpler hardware
 - Search for transactions in recent history by querying the event attributes
 - Filter live events using advanced queries, e.g., `transfer.amount > 150uscrt AND message.module='compute'`
 - Infinitley scale by chaining multiple layers together (with or without indexing enabled)
 - Write, test, and visualize queries using the interactive front-end


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

