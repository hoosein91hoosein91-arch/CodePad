// Portable Windows launcher for the exported app/ directory. Standard library
// only. Build: GOOS=windows GOARCH=amd64 go build -ldflags="-H=windowsgui" -o Start.exe main.go
package main

import (
    "fmt"
    "net"
    "net/http"
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "sync/atomic"
    "time"
)

func fail(err error) {
    executable, _ := os.Executable()
    os.WriteFile(filepath.Join(filepath.Dir(executable), "CodePad-error.txt"), []byte(err.Error()), 0600)
    os.Exit(1)
}

func main() {
    executable, err := os.Executable(); if err != nil { fail(err) }
    root := filepath.Join(filepath.Dir(executable), "app")
    if _, err = os.Stat(filepath.Join(root, "index.html")); err != nil { fail(fmt.Errorf("Keep the app folder beside Start.exe: %w", err)) }
    listener, err := net.Listen("tcp", "127.0.0.1:0"); if err != nil { fail(err) }
    address := listener.Addr().String()
    url := "http://" + address + "/"
    var last atomic.Int64; last.Store(time.Now().Unix())
    handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Host != address { http.Error(w, "Invalid host", 403); return }
        if r.URL.Path == "/__codepad_ping" {
            if r.Method != "POST" || (r.Header.Get("Origin") != "" && r.Header.Get("Origin") != strings.TrimSuffix(url,"/")) { http.Error(w,"Forbidden",403); return }
            last.Store(time.Now().Unix()); w.WriteHeader(204); return
        }
        if r.Method != "GET" && r.Method != "HEAD" { w.WriteHeader(405); return }
        name := filepath.Clean(filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(r.URL.Path,"/"))))
        relative, err := filepath.Rel(root, name)
        if err != nil || relative == ".." || strings.HasPrefix(relative,".."+string(os.PathSeparator)) { http.Error(w,"Forbidden",403); return }
        if r.URL.Path == "/" { name = filepath.Join(root,"index.html") }
        switch filepath.Ext(name) { case ".js", ".mjs": w.Header().Set("Content-Type","application/javascript"); case ".wasm": w.Header().Set("Content-Type","application/wasm") }
        w.Header().Set("Cache-Control","no-cache")
        http.ServeFile(w,r,name)
    })
    server := &http.Server{Handler:handler, ReadHeaderTimeout:10*time.Second}
    go func(){ if err:=server.Serve(listener); err!=nil && err!=http.ErrServerClosed { fail(err) } }()
    opened := false
    for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
        for _, browser := range []string{"Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe"} {
            path := filepath.Join(base,filepath.FromSlash(browser))
            if _, err:=os.Stat(path); err==nil {
                if exec.Command(path,"--app="+url).Start()==nil { opened=true; break }
            }
        }
        if opened { break }
    }
    if !opened { if err:=exec.Command("rundll32.exe","url.dll,FileProtocolHandler",url).Start();err!=nil { fail(err) } }
    // The browser host pings every 15 seconds. Exit after the window closes.
    for range time.Tick(15*time.Second) { if time.Now().Unix()-last.Load()>120 { server.Close(); return } }
}
