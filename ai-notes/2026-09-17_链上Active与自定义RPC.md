# 链上 Active 与自定义 RPC

## 决策

- 用户批准纯前端链上读取，范围明确为 BSC 与 Robinhood Chain（不是 Ronin）。支持 PancakeSwap v3（BSC）和 Uniswap v3/v4（两链）。
- 输入单 NFT 编号或官方仓位链接，不扫描钱包。默认公共主备节点，支持自定义 HTTPS RPC，仅页面内存，不持久化。
- 自定义节点失败不回退到公共节点；恢复公共节点由用户显式点击。
- 沿用现有界面与数学模型；新增读取栏，本金与 APR 仍需手填，换仓位清空这两项。

## 实现边界

- v3 从 PositionManager、Factory、Pool 读取；v4 从 PositionManager、完整 PoolKey hash、StateView 读取。
- 锁定同一区块。区间为 lower <= tick < upper；出区间不代入，非零 Hook 不自动套用手续费模型，Permissioned 仓位拒绝。
- 每节点 10 秒总时限，默认备用重启全快照；拒绝超过 5 分钟的区块。取消和输入变更不会让旧查询覆盖新输入。
- 部署地址和 RPC 的官方链接集中在 README。样本只用于本地只读验证，不在仓库保存用户仓位或私人 RPC。
- 引入 viem 与 esbuild；npm ci 安装锁定依赖，构建仍输出静态资源。GitHub Actions 增加安装步骤。

## 验证

- 30 项自动测试通过（数学、v3/v4 读取、RPC 主备、取消、手动切换与字段关联）；五个平台默认公共 RPC 的真实仓位读取通过。
- Chrome 实际验证 BSC/Robinhood 自动填入、错误链自定义节点、地址刷新清空、出区间不估算；桌面与 390px 手机布局复核完成，finish review 为 ship，无待修项。
- npm run check、npm run build、git diff --check 通过；公开文件敏感模式扫描未发现私人凭据、个人邮箱或本机路径。
- 公共端点已检查 chainId、合约代码及允许 GitHub Pages Origin 的 CORS 响应。
- 后续发布以当前提交的测试、构建、浏览器结果和 GitHub Actions 为准。
