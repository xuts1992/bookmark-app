package main

import (
	"log"
	"sync"
	"time"

	"gorm.io/gorm"
)

// 资源定时同步调度器的控制句柄：用于热重启（停掉旧定时器再起新的）
var (
	syncMu   sync.Mutex
	syncStop chan struct{}
)

// startSyncScheduler 启动「资源定时同步」调度器：按 interval 周期性把全部书签的图标与封面本地化。
// 线程安全：每次调用先停掉上一个定时器（若已存在），再按新设置决定是否启动。
// 当 SyncEnabled 为 false 或间隔 <=0 时仅停止、不启动。
func startSyncScheduler(db *gorm.DB, s Setting) {
	syncMu.Lock()
	defer syncMu.Unlock()
	if syncStop != nil {
		close(syncStop) // 通知旧 goroutine 退出
		syncStop = nil
	}
	if !s.SyncEnabled || s.SyncIntervalMinutes <= 0 {
		log.Println("资源定时同步：未启用（开关关闭或间隔无效）")
		return
	}
	stop := make(chan struct{})
	syncStop = stop
	interval := time.Duration(s.SyncIntervalMinutes) * time.Minute
	log.Printf("资源定时同步：已启用，每 %d 分钟执行一次", s.SyncIntervalMinutes)
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				log.Println("资源定时同步：开始本地化所有书签的图标与封面")
				localizeExistingResources(db)
			}
		}
	}()
}
