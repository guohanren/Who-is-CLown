# CLAUDE.md - Claude Code 开发指引

## 项目概述
这是一个仿CF穿越火线"谁是小丑"模式的第一人称3D网页游戏。
当前为单机版原型，核心玩法已跑通，需要迭代优化。

## 开发环境
```bash
npm install
npm run dev    # 启动开发服务器 http://localhost:3000
npm run build  # 构建生产版本
```

## 核心文件
- `src/Game.jsx` — 游戏全部逻辑（约600行），包括：
  - 角色创建（mkHumanoid/mkClown/mkCop/mkWal）
  - AI行为系统（updateAI函数）
  - 警察AI（cops.forEach循环内）
  - 触控系统（onJS/onJM/onJE + onLS/onLM/onLE）
  - 游戏循环（tick函数）
  - HUD渲染（React JSX部分）

## 代码架构说明
游戏没有用ECS或其他框架，是**命令式**写法：
- Three.js场景在`initGame()`中创建
- 游戏状态存在`G`对象上，通过`gRef.current`访问
- 游戏循环用`requestAnimationFrame`
- React只负责HUD覆盖层，3D部分完全在imperative代码中
- 触控事件通过React的onTouchStart等绑定

## 重要注意事项
1. **Three.js r128**：不要用CapsuleGeometry（r142才有）
2. **不能用Object.assign设position**：Three.js的position是只读属性，用`mesh.position.set(x,y,z)`
3. **useEffect不要依赖hud state**：会导致每帧重渲染卡死，小地图直接在游戏循环中用canvas画
4. **触控input状态**：切换界面时必须重置jtId/ltId/jx/jy，否则控件会卡住
5. **initGame时机**：DOM可能还没ready，用requestAnimationFrame延迟检测

## 优先迭代方向
1. **代码拆分**：Game.jsx太大了，建议拆成：
   - `scene.js` - 场景/地图构建
   - `characters.js` - 角色模型创建
   - `ai.js` - AI行为逻辑
   - `controls.js` - 触控/键盘输入
   - `hud.jsx` - React HUD组件
   - `config.js` - 配置参数
2. **音效**：加入枪声、脚步声、占领音效
3. **视觉效果**：射击闪光、受伤反馈、击杀特效
4. **地图丰富**：更多掩体和建筑细节
5. **多人联机**：WebSocket房间制

## 联机架构建议
```
前端(Vite+React+Three.js)
  ↕ WebSocket
后端(Node.js)
  - 房间管理
  - 游戏状态权威服务器
  - 位置同步(30fps)
  - 事件广播(射击/击杀/占领)
```

推荐用 `ws` 或 `socket.io` 库，服务器部署到 Render.com / Fly.io（免费）。
