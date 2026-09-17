# LP 边际年化计算器

输入已有仓位的本金、Active 份额、手续费 APR，以及同区间准备追加的金额，估算新增资金能给整个仓位多带来多少手续费。

## 在线使用

[打开计算器](https://blockbloomer.github.io/Marginal-APR-Calculator/)

仓库附带 GitHub Pages 发布工作流。启用 Pages 的 GitHub Actions 发布来源后，每次推送 `main` 都会先测试、再构建和发布。

页面不要求连接钱包或登录；年化计算在访问者的浏览器内完成。可以手填 Active，也可以读取链上仓位自动填写。

## 自动读取 Active

支持 BSC 的 PancakeSwap v3、Uniswap v3/v4，以及 Robinhood Chain 的 Uniswap v3/v4。选择平台并输入 NFT 编号，或直接粘贴仓位详情链接；可识别的链接会自动选择平台。这里的 Robinhood 链 ID 为 4663，不是 Ronin。

读取只针对一个 NFT。本金与手续费 APR 仍需填写同一仓位的数据；换读另一个仓位时这两项会清空，防止误用示例或旧仓位参数。刷新同一仓位保留这两项，但应同时检查其是否仍准确。

在同一区块读取仓位流动性 `L_position`、池子当前活跃流动性 `L_pool` 和当前 tick：

```
tickLower <= tick < tickUpper 时：Active = L_position / L_pool × 100%
出区间时：Active = 0，暂停自动代入年化模型
```

Uniswap v4 使用完整 PoolKey 计算 poolId，从 StateView 读取池子状态。带自定义 Hook 的池子可读取份额，但手续费分配可能不同，暂不自动代入；Permissioned 仓位不支持。空仓位、销毁仓位、错误网络、过期区块、无效数据均显示错误，不沿用旧结果。

这是按下按钮时的区块快照，不是持续实时监控。价格或其他 LP 改变后请再次读取；历史 APR 与当前份额组合也只产生静态估计。

### 公共与自定义 RPC

| 网络 | 默认节点 | 备用节点 |
| --- | --- | --- |
| BSC | `https://bsc-dataseed.bnbchain.org` | `https://bsc-dataseed-public.bnbchain.org` |
| Robinhood | `https://rpc.mainnet.chain.robinhood.com` | `https://robinhood-rpc.publicnode.com` |

公共节点失败时重新在备用节点读取整份快照，不混合区块。每个节点最多等待 10 秒；区块时间超过 5 分钟会拒绝。

在「RPC 设置」中可以填自己的 HTTPS RPC。需支持所选链及浏览器跨域访问（CORS）；API Key 可以位于地址路径或查询参数中。自定义节点失败时不会自动向公共节点发送查询，点击「恢复公共 RPC」后再读取即可。

自定义地址仅存在当前页面，不写入浏览器持久存储、分享链接或应用日志，刷新后清空。浏览器扩展、开发者工具及节点服务商仍可能看到地址与请求；不要在公共代码中硬编码私人节点凭据。RPC 服务商会看到仓位查询，页面不会将本金和 APR 发给 RPC。所有请求均为只读，不连接钱包、不签名、不发送交易。

整个网站仍是纯前端，GitHub Pages 即可托管，无需自建服务器或数据库。

官方依据：[BSC RPC](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/)、[Robinhood 网络](https://docs.robinhood.com/chain/connecting/)、[PublicNode](https://robinhood.publicnode.com/)、[PancakeSwap v3 部署](https://developer.pancakeswap.finance/contracts/v3/addresses)、[Uniswap BSC v3 部署](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-bnb-deployments)、[Uniswap Robinhood v3 部署](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments)、[Uniswap v4 部署](https://developers.uniswap.org/docs/protocols/v4/deployments)。

## 本地运行

需要 Node.js 20 或更高版本。viem 负责合约编码与解码，esbuild 将依赖打包进静态资源，无需运行时 CDN。

```bash
git clone https://github.com/blockbloomer/Marginal-APR-Calculator.git
cd Marginal-APR-Calculator
npm ci
npm run dev
```

打开 [本地计算器](http://127.0.0.1:5193/)。在运行服务的终端按 Ctrl+C 停止。若该端口被占用，可运行 `PORT=5194 npm run dev`，并打开终端显示的新地址。

打包后运行：

```bash
npm run build
npm start
```

服务只监听本机 `127.0.0.1`。手动计算可离线使用；自动读取仓位需要联网访问所选 RPC。页面资源均随构建产物一起发布。

## 发布自己的网页

1. 将仓库 fork 到自己的 GitHub 账号。
2. 在仓库 `Settings → Pages → Build and deployment` 中，将 Source 设为 `GitHub Actions`。
3. 在 `Actions → Deploy GitHub Pages` 中手动运行工作流，或向 `main` 推送代码。
4. 工作流完成后，从 Pages 设置页取得公开链接。

网页入口与资源均使用相对路径，兼容 GitHub 项目 Pages 的子目录。部署只包含 `dist/` 内的网页文件，不包含开发记录或服务端脚本。

## 输入和输出

- **已投入本金**：现有仓位按当前同一计价单位折算的价值，页面以 U 表示。
- **当前 Active 份额**：在当前成交价附近，自己占活跃流动性的比例。不是自己的资金利用率，也不是全池 TVL 占比。
- **现有仓位手续费年化**：自己仓位的手续费单利 APR，不是池子总 APR，也不是复利 APY。仅有本金和份额，无法确定年化。
- **追加本金**：同一区间、按原布仓比例追加的金额，可输入或使用滑块调整。

主要结果为**整笔新增资金的边际手续费 APR**。下方说明每天多赚多少手续费，辅助指标显示每小时多赚的手续费；按一年 365 天、每天 24 小时折算。另列追加后份额、下一小笔资金的瞬时边际 APR，以及加仓前后账本。

所有 APR 都只是手续费口径，未扣币价/持仓盈亏、gas 或调仓成本，不是净收益预测。模型假设价格区间、布仓比例、其他 LP 和可分配手续费规模不变。现实中的价格、LP 竞争和成交量改变时，需重新估计。

## 数学口径

原本金 `K`，原份额小数 `s`，追加本金 `a`，原整体手续费年化小数 `r`，稀释系数 `d = K / (K + s × a)`：

| 结果 | 公式 |
| --- | --- |
| 追加后整体 APR | `r × d` |
| 整笔新增 APR | `r × (1 − s) × d` |
| 新增年手续费 | `a × r × (1 − s) × d` |
| 加完后再加一小笔的 APR | `r × (1 − s) × d²` |
| 追加后份额 | `s + (1 − s) × s × a / (K + s × a)` |

页面与模型 API 的 APR、份额输入使用百分数，例如 `60` 代表 `60%`，`70` 代表 `70%`。实现保留原始互补份额，避免接近 100% 时因浮点相减导致边际值错误归零。

示例：原本金 2000 U、份额 70%、原手续费 APR 60%，再加 1000 U：整笔新增 APR 13.3333%，加后份额 77.7778%，年手续费增量 133.3333 U。示例不是实际池子数据。

追加 0 时没有整笔新增 APR，页面显示「尚未追加」；曲线零点显示小额极限。已有份额为 100% 时，固定总手续费模型下新增手续费为零。

为了明确数值边界，本金支持 `0.000001` 至 `1e12` U，追加支持 `0` 至 `1e12` U，份额支持 `0.00000001%` 至 `100%`，APR 支持 `0%` 至 `1,000,000%`。超出范围时显示具体错误并隐藏旧结果。

## 验证与维护

```bash
npm test
npm run check
npm run build
```

- `public/model.mjs`：独立数值模型与校验。
- `public/app.mjs`：表单、滑块、图表与结果联动。
- `public/positions.mjs`：平台配置、链接解析、同区块链上读取与 Active 计算。
- `public/import-position.mjs`：查询状态、取消、自动填入和自定义 RPC 控件。
- `public/index.html`、`public/styles.css`：本地页面与样式。
- `tests/model.test.mjs`：数值、守恒、规模一致性与边界测试。
- `tests/positions.test.mjs`：v3/v4 编解码、区间边界、RPC 主备、错误、隐私与超时测试。
- `scripts/serve.mjs`：仅本地监听的静态服务。
- `scripts/build.mjs`：检查 JavaScript 语法并打包资源到忽略的 `dist/`。

可选浏览器 WebMCP 功能以 feature detection 注册参数配置工具；不支持该接口的浏览器仍可使用全部页面功能。
