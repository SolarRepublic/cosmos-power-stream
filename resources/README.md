# Admin Resources for Cosmos Power Stream

### Setting up a Systemd service for Hosting

Copy the contents of [cosmos-power-stream-host.service](cosmos-power-stream-host.service).

```bash
sudo nano /etc/systemd/system/cosmos-power-stream-host.service
# paste and edit the cosmos-power-stream-host.service file
sudo systemctl daemon-reload
sudo systemctl enable cosmos-power-stream-host
sudo systemctl start cosmos-power-stream-host

# verify its working
sudo journalctl -fu cosmos-power-stream-host
```


### Setting up a Systemd service for Indexing

Copy the contents of [cosmos-power-stream-indexer.service](cosmos-power-stream-indexer.service).

```bash
sudo nano /etc/systemd/system/cosmos-power-stream-indexer.service
# paste and edit the cosmos-power-stream-indexer.service file
sudo systemctl daemon-reload
sudo systemctl enable cosmos-power-stream-indexer
sudo systemctl start cosmos-power-stream-indexer

# verify its working
sudo journalctl -fu cosmos-power-stream-indexer
```


### Hosting on a Cosmos node: nginx

See [cosmos.nginx](cosmos.nginx) for an example of how to configure your nginx site by proxying to the various common RPC/API endpoints, including an override proxy for the power stream websocket.


