This service extends the [Tendermint/CometBFT events stream](https://docs.cometbft.com/v0.37/core/subscription) over WebSocket, indexing events on the server and allowing clients to search for transactions back in time by their event attributes. The query syntax also extends the original, allowing developers to write complex filters. The endpoint is fully backwards-compatible with the original `/websocket` endpoint.

# GUI

You can use this web application to write and test queries against live and historical data.

Keyboard shortcut to execute a query is: Cmd+Enter or Ctrl+Enter, depending on your platform.


# Query Syntax

The EBNF of the grammar is as follows:
```
query    = groups { ("AND" | "OR" | "&&" | "||") groups } ;
groups   = "(" query ")" | expr ;
expr     = path ( operator value | unary );
unary    = "exists" | "not exists" ;
path     = pattern { "." path } | "`" .* "`";
pattern  = IDENTIFIER { ("." | "*") pattern }
operator = "<" | ">" | "<=" | ">=" | "!=" | "=" | "includes" | "like" | "in" ;
value    = quantity | string | set
quantity = ["-" | "+"] DIGITS [UNITS]
string   = ('"' .* '"") | ("'" .* "'") | ("`" .* "`")
set      = "(" { (quantity | string) [","] } ")"
```

## Examples:
```
tx.height > 100 AND tx.height < 500

transfer.amount > 5000000uscrt AND message.sender in ("...", "...")

message.module = 'compute' AND wasm.
```
