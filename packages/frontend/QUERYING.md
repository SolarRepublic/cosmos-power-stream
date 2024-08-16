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
