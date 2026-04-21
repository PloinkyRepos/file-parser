# Running `gemma4:31b` on Ubuntu 22.04 with Ploinky

This guide is for a fresh Ubuntu 22.04 machine that does not have Ploinky installed yet.

As of April 16, 2026, the official Ollama model tag for the local 31B Gemma 4 model is `gemma4:31b`.

## What this guide assumes

- Ubuntu 22.04 LTS
- x86_64
- internet access
- Docker will be used as the container runtime
- you want to run the `basic/ollama` Ploinky agent, not bare Ollama directly

## Important reality check

`gemma4:31b` is a large local model. In practice, you should plan for a high-VRAM NVIDIA GPU. CPU-only inference is technically possible in some setups, but it is usually too slow to be useful for a 31B model.

This specific Ploinky agent is CPU-only by default in [basic/ollama/manifest.json](/Users/danielsava/work/file-parser/basic/ollama/manifest.json:17), so you must explicitly enable GPU use before first start.

Also, current Ploinky container startup does not add `--gpus all` automatically, so the cleanest way to make this agent see the GPU is to configure Docker's NVIDIA runtime on the host first.

## 1. Install base packages

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates gnupg2 build-essential
```

`build-essential` is included so Node can fall back to source builds if needed.

## 2. Install Docker

The shortest supported path is Docker's convenience installer:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
docker version
```

If `docker version` works without `sudo`, your shell is ready.

## 3. Verify the host NVIDIA driver

Before touching Ploinky, confirm the host can already see the GPU:

```bash
nvidia-smi
```

If `nvidia-smi` fails, stop here and install a working NVIDIA driver first. Ollama requires a compatible GPU and driver. According to Ollama's current hardware docs, NVIDIA GPUs need compute capability 5.0+ and driver version 531 or newer.

## 4. Install NVIDIA Container Toolkit for Docker

Configure the NVIDIA apt repository and install the toolkit:

```bash
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
```

Configure Docker to use the NVIDIA runtime and make it the default runtime for this host:

```bash
sudo nvidia-ctk runtime configure --runtime=docker --set-as-default
sudo systemctl restart docker
```

Test GPU access from Docker itself:

```bash
docker run --rm --gpus all ubuntu nvidia-smi
```

If this fails, do not continue to the Ploinky step yet.

## 5. Install Node.js for Ploinky

Ploinky requires Node.js 18+. Using `nvm` is the least fragile option on a fresh Ubuntu box.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 22
nvm alias default 22
node -v
npm -v
```

## 6. Clone and expose Ploinky

```bash
cd "$HOME"
git clone https://github.com/OutfinityResearch/ploinky.git
cd ploinky
export PATH="$PATH:$HOME/ploinky/bin"
ploinky --help
```

If you want this available in future shells:

```bash
echo 'export PATH="$PATH:$HOME/ploinky/bin"' >> ~/.bashrc
source ~/.bashrc
```

## 7. Add the `basic` repo and enable the Ollama agent

```bash
cd "$HOME/ploinky"
ploinky add repo basic
ploinky enable repo basic
ploinky enable agent basic/ollama
```

## 8. Set the agent to use `gemma4:31b` and the GPU

The `basic/ollama` agent defaults to `gemma4:e2b`, so override that before first start:

```bash
ploinky var OLLAMA_DEFAULT_MODEL gemma4:31b
ploinky var CUDA_VISIBLE_DEVICES all
```

Optional but recommended for a large model:

```bash
ploinky var OLLAMA_MAX_LOADED_MODELS 1
ploinky var OLLAMA_NUM_PARALLEL 1
```

These already match the current manifest defaults, but setting them explicitly makes the host intent obvious.

## 9. Start the workspace for the first time

On the first run, Ploinky needs a static agent name and a router port. Use `ollama` for that initial workspace bootstrap:

```bash
ploinky start ollama 8080
```

Notes:

- `8080` is the Ploinky router port, not the Ollama API port.
- The Ollama API still listens on `127.0.0.1:11434`.
- The first startup can take a long time because `bootstrap.sh` will pull `gemma4:31b` before reporting success.

## 10. Verify that the model is installed and using the GPU

Check installed models:

```bash
ploinky cli ollama list
```

`ploinky cli ollama list` should include `gemma4:31b`.

`ploinky cli ollama ps` only shows models that are currently loaded in memory, so it may be empty until after the first request.

After you make one inference call, check currently loaded models and processor placement:

```bash
ploinky cli ollama ps
```

You want the `Processor` column to show GPU usage. If it says `100% CPU`, the GPU passthrough or host runtime setup is not correct, or the model could not fit as expected.

## 11. Call the model

Use Ollama's OpenAI-compatible endpoint through the agent:

```bash
curl -H "Content-Type: application/json" \
  http://127.0.0.1:11434/v1/chat/completions \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      { "role": "user", "content": "Say hello in one sentence." }
    ]
  }'
```

## 12. Publish the Ollama API through Cloudflare Tunnel

This is the clean way to reach the model remotely without opening inbound firewall ports on the Ubuntu host.

What you need first:

- a Cloudflare account
- a domain already managed in Cloudflare DNS
- a hostname you want to use, for example `llm.example.com`

Important security note:

Exposing an LLM API on a public hostname is risky if you leave it open to the Internet. Cloudflare Tunnel keeps the host off the public Internet, but the hostname itself can still be public unless you also protect it with Cloudflare Access. For anything other than a private lab setup, add an Access policy in the Cloudflare dashboard after the tunnel is up.

### 12.1 Install `cloudflared`

On Ubuntu 22.04, install it from Cloudflare's package repository:

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update
sudo apt-get install -y cloudflared
cloudflared --version
```

### 12.2 Authenticate `cloudflared` with your Cloudflare account

```bash
cloudflared tunnel login
```

This opens a browser flow. Choose the Cloudflare zone that will host your tunnel hostname.

### 12.3 Create a named tunnel

```bash
cloudflared tunnel create ollama-api
cloudflared tunnel list
```

Take note of the tunnel UUID from the output.

### 12.4 Create a DNS route for the hostname

Replace `llm.example.com` with your real hostname:

```bash
cloudflared tunnel route dns ollama-api llm.example.com
```

### 12.5 Create the local tunnel config

Find the credentials file that was created in `~/.cloudflared/`. It will look like:

```text
~/.cloudflared/<TUNNEL_UUID>.json
```

Then create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/<YOUR_USER>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: llm.example.com
    service: http://127.0.0.1:11434
    originRequest:
      httpHostHeader: localhost:11434
  - service: http_status:404
```

Why `httpHostHeader` is set:

Ollama's own FAQ recommends `--http-host-header="localhost:11434"` when using Cloudflare Tunnel. The config above applies the same behavior in persistent service form.

### 12.6 Install `cloudflared` as a systemd service

Replace `<YOUR_USER>` with your Linux username:

```bash
sudo cloudflared --config /home/<YOUR_USER>/.cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

If you later change `config.yml`, reload it with:

```bash
sudo systemctl restart cloudflared
```

### 12.7 Test the tunneled endpoint

Once the service is healthy, call the public hostname instead of localhost:

```bash
curl -H "Content-Type: application/json" \
  https://llm.example.com/v1/chat/completions \
  -d '{
    "model": "gemma4:31b",
    "messages": [
      { "role": "user", "content": "Say hello in one sentence." }
    ]
  }'
```

### 12.8 Optional but recommended: protect the hostname with Cloudflare Access

In the Cloudflare dashboard:

1. Go to Zero Trust or Cloudflare One.
2. Create an Access application for `llm.example.com`.
3. Add an access policy limited to your email, identity provider group, or service tokens.

If you enable Access, browser use is straightforward. Programmatic API use will need Cloudflare Access credentials on the client side.

## 13. Useful follow-up commands

Restart the workspace later:

```bash
ploinky start
```

Inspect the Ollama container shell:

```bash
ploinky shell ollama
```

Pull another model:

```bash
ploinky cli ollama pull qwen3-coder:30b
```

Change the default model later:

```bash
ploinky var OLLAMA_DEFAULT_MODEL gemma4:31b
ploinky reinstall agent ollama
```

## 14. If `gemma4:31b` is too heavy for the machine

Use one of these instead:

- `gemma4:26b`
- `gemma4:e4b`
- `gemma4:e2b`

Switching is the same pattern:

```bash
ploinky var OLLAMA_DEFAULT_MODEL gemma4:26b
ploinky reinstall agent ollama
```

## 15. Troubleshooting

### Docker sees no GPU

Check:

```bash
nvidia-smi
docker run --rm --gpus all ubuntu nvidia-smi
```

If either fails, fix host GPU runtime before touching Ploinky.

### Ploinky starts but Ollama runs on CPU

Check:

```bash
ploinky echo CUDA_VISIBLE_DEVICES
ploinky cli ollama ps
```

If `CUDA_VISIBLE_DEVICES` is empty, set it and reinstall:

```bash
ploinky var CUDA_VISIBLE_DEVICES all
ploinky reinstall agent ollama
```

### `cloudflared` is up but the hostname cannot reach Ollama

Check:

```bash
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -n 100 --no-pager
curl http://127.0.0.1:11434/api/tags
```

If localhost works but the public hostname does not, the usual causes are:

- wrong tunnel UUID or credentials file in `~/.cloudflared/config.yml`
- wrong DNS hostname
- `cloudflared` not restarted after config changes
- hostname route protected by Cloudflare Access without valid client auth

### Tunnel works but Ollama rejects or mishandles requests

Double-check that your `~/.cloudflared/config.yml` contains:

```yaml
originRequest:
  httpHostHeader: localhost:11434
```

That matches Ollama's current Cloudflare Tunnel guidance.

### First start takes a very long time

That is normal for `gemma4:31b`. The agent now waits for the requested model to be present before bootstrap completes.

### The model does not fit well on the machine

That is a hardware limit, not a Ploinky bug. Move down to `gemma4:26b` or `gemma4:e4b`.

## Sources

- Ploinky prerequisites and CLI usage: [ploinky/README.md](/Users/danielsava/work/file-parser/ploinky/README.md:9)
- Current Ollama agent manifest: [basic/ollama/manifest.json](/Users/danielsava/work/file-parser/basic/ollama/manifest.json:1)
- Current Ollama bootstrap logic: [basic/ollama/bootstrap.sh](/Users/danielsava/work/file-parser/basic/ollama/bootstrap.sh:1)
- Ollama Linux install page: https://ollama.com/download/linux
- Ollama Docker docs: https://docs.ollama.com/docker
- Ollama hardware support docs: https://docs.ollama.com/gpu
- Ollama FAQ: https://docs.ollama.com/faq
- Ollama Gemma 4 library page: https://ollama.com/library/gemma4
- Cloudflare Tunnel setup: https://developers.cloudflare.com/tunnel/setup/
- Cloudflare `cloudflared` downloads: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/
- Cloudflare `cloudflared` Linux service: https://developers.cloudflare.com/tunnel/advanced/local-management/as-a-service/linux/
- Cloudflare local tunnel management: https://developers.cloudflare.com/tunnel/advanced/local-management/create-local-tunnel/
- Cloudflare routing and DNS for tunnels: https://developers.cloudflare.com/tunnel/routing/
- Cloudflare package repository: https://pkg.cloudflare.com/index.html
- NVIDIA Container Toolkit install guide: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/1.18.0/install-guide.html
- `nvm` install instructions: https://github.com/nvm-sh/nvm
