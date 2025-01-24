# CFChecker Discord Bot

这是一个基于 **Node.js** + **discord.js** + **SQLite**（使用 [better-sqlite3](https://www.npmjs.com/package/better-sqlite3)）的 Discord Bot，用于让用户绑定并验证自己的 Codeforces 账号。它提供如下主要命令：

- `/start`: 生成随机字符串，并引导用户修改 Codeforces `firstName`  
- `/check <用户名>`: 调用 Codeforces API，对比用户的 `firstName` 与分配的随机串，若匹配成功则分配“Verified”角色  
- `/whoami`: 查看当前用户在 Bot 中的绑定状态  
- `/cleanup <days>`: 管理员命令，清理长时间未完成验证的记录

## 项目文件说明

- **`constants.js`**  
  定义常量，如 `BOT_TOKEN`、数据库文件路径等配置。

- **`index.js`**  
  Bot 主逻辑，包括命令的执行、SQLite 读写、调用 Codeforces API 等。  
  1. 使用 Slash Commands 监听 `/start`, `/check`, `/whoami`, `/cleanup`  
  2. 在数据库或内存 Map 中保存验证状态  
  3. 验证成功后给用户分配 `Verified` 角色

- **`deploy-commands.js`**  
  用于将 `/start`, `/check`, `/whoami`, `/cleanup` 等命令注册到指定的 Discord 服务器（Guild）或全局。  
  1. 读取 `BOT_TOKEN`、`CLIENT_ID`、`GUILD_ID`  
  2. 向 Discord API 提交命令数据

- **`package-lock.json`**  
  Node.js 依赖锁定文件，确保在不同环境下安装依赖版本一致。

## 前置条件

1. 在 [Discord Developer Portal](https://discord.com/developers/applications) 创建应用、添加一个 Bot，获取到:
   - **Bot Token**
   - **Application (Client) ID**
   - (可选) 要注册命令的服务器 **Guild ID**（如果只想在一个服务器里注册命令）
2. 在“Bot”设置页面开启必要权限（如 `Manage Roles`），并在“Privileged Gateway Intents”中启用 `GuildMembers`（若需要读取成员信息或分配角色）。
3. Node.js 16+ (建议 Node.js 18 及以上)

## 使用步骤

### 1. **克隆或下载项目代码**  
   ```bash
   git clone https://github.com/BruceKZ/dcbot-cfchecker.git
   cd dcbot-cfchecker
  ```

### 2. **安装依赖**
  ```bash
  npm install
  ```

### 3. **配置常量**
1. 打开 `constants.js` 文件，填入以下关键信息：
   - **BOT_TOKEN**：你的 Bot 在 [Discord Developer Portal](https://discord.com/developers/applications) 中 “Bot” 页面获取的 Token。
   - **CLIENT_ID**：应用 (App) 的 Client ID，通常在应用信息 (General Information) 区域可查看。
   - **GUILD_ID**：若只想在某个服务器中注册 Slash 命令，则填该服务器的 ID（右键服务器图标 → 复制 ID，需要先开启开发者模式）。

2. 如果需要在多个服务器部署命令，可自行在 `deploy-commands.js` 中做相应修改（比如循环多次注册），或改为全局命令。

### 4. 部署 Slash Commands

在命令行执行：
  ```bash
  node deploy-commands.js
  ```
该脚本会向 Discord API 注册（或更新）`/start`, `/check`, `/whoami`, `/cleanup` 四个命令到你配置的 GUILD_ID 服务器中。
如果想改为全局注册，可以将 `Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)` 替换成 `Routes.applicationCommands(CLIENT_ID)` 并重新执行脚本。请注意，全局命令生效可能需要数小时。

### 5. 运行 Bot

在命令行执行：
  ```bash
  node index.js
  ```
