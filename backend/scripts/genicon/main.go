// genicon 把 icon.ico 编译为 Go 字节数组（等效 //go:embed，规避本机 Go 对子包 embed 的 bug）
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Println("用法: genicon <icon.ico> <output.go>")
		os.Exit(1)
	}
	data, err := os.ReadFile(os.Args[1])
	if err != nil {
		fmt.Println("读取失败:", err)
		os.Exit(1)
	}
	out := "package main\n\n// iconBytes 由 scripts/genicon 从 icon.ico 生成（编译期内嵌托盘图标，运行时不依赖文件）\nvar iconBytes = []byte{\n"
	for i, b := range data {
		if i%16 == 0 {
			out += "\t"
		}
		out += fmt.Sprintf("0x%02x,", b)
		if i%16 == 15 {
			out += "\n"
		}
	}
	if len(data)%16 != 0 {
		out += "\n"
	}
	out += "}\n"
	if err := os.WriteFile(os.Args[2], []byte(out), 0o644); err != nil {
		fmt.Println("写入失败:", err)
		os.Exit(1)
	}
	fmt.Printf("已生成 %s (%d 字节)\n", os.Args[2], len(data))
}
