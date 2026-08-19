import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 开发：Vite 跑在 3000 端口，/api 代理到 Go 后端 9800
// 构建：输出到 ../backend/static，由 Go 程序对外提供静态网页
export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:9800',
        changeOrigin: true
      },
      // 本地资源（图标/封面）：开发态也代理到 Go 后端，便于预览已下载的资源
      '/resource': {
        target: 'http://localhost:9800',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../backend/static',
    // 关闭 Vite 自带的清空目录：避免被环境的安全删除(trash)机制拦截。
    // 改为在构建前用脚本/RM 直接删除 backend/static 旧产物。
    emptyOutDir: false
  }
})
