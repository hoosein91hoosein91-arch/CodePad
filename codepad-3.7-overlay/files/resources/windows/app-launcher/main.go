// CodePad for Windows: serves the built web app from the "app" folder on 127.0.0.1 and opens it in an
// Edge/Chrome app window. Standard library only.
// Build: GOOS=windows GOARCH=amd64 go build -ldflags="-H=windowsgui -s -w" -o CodePad.exe main.go
//
// - A fixed first port (47831) keeps the browser origin stable, so projects saved in localStorage/IndexedDB survive restarts.
// - The window uses its own browser profile (%LOCALAPPDATA%\CodePad\profile): the launcher exits when that window closes.
// - Launching twice reuses the running instance.
package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
)

const firstPort = 47831
const portCount = 10
const marker = "codepad-launcher-1"

func fail(err error) {
	executable, _ := os.Executable()
	_ = os.WriteFile(filepath.Join(filepath.Dir(executable), "CodePad-error.txt"), []byte(err.Error()+"\n"), 0o600)
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func contentType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".js", ".mjs":
		return "application/javascript"
	case ".wasm":
		return "application/wasm"
	case ".css":
		return "text/css; charset=utf-8"
	case ".html", ".htm":
		return "text/html; charset=utf-8"
	case ".json", ".webmanifest":
		return "application/json"
	case ".svg":
		return "image/svg+xml"
	case ".woff2":
		return "font/woff2"
	case ".woff":
		return "font/woff"
	case ".bin", ".task", ".zip":
		return "application/octet-stream"
	}
	return ""
}

// existing reports whether another CodePad launcher already serves on this port.
func existing(port int) bool {
	client := http.Client{Timeout: 700 * time.Millisecond}
	response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/__codepad_ok", port))
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.Header.Get("X-CodePad") == marker
}

func openBrowser(url string) (*exec.Cmd, bool) {
	if custom := os.Getenv("CODEPAD_BROWSER"); custom != "" {
		cmd := exec.Command(custom, url)
		return cmd, cmd.Start() == nil
	}
	if os.Getenv("CODEPAD_NO_BROWSER") == "1" {
		return nil, true
	}
	if runtime.GOOS == "windows" {
		profile := filepath.Join(os.Getenv("LOCALAPPDATA"), "CodePad", "profile")
		_ = os.MkdirAll(profile, 0o700)
		for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
			if base == "" {
				continue
			}
			for _, browser := range []string{"Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe"} {
				path := filepath.Join(base, filepath.FromSlash(browser))
				if _, err := os.Stat(path); err != nil {
					continue
				}
				cmd := exec.Command(path, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check", "--window-size=1280,860")
				if cmd.Start() == nil {
					return cmd, true
				}
			}
		}
		cmd := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url)
		return nil, cmd.Start() == nil
	}
	cmd := exec.Command("xdg-open", url)
	return nil, cmd.Start() == nil
}

func main() {
	executable, err := os.Executable()
	if err != nil {
		fail(err)
	}
	root := os.Getenv("CODEPAD_APP")
	if root == "" {
		root = filepath.Join(filepath.Dir(executable), "app")
	}
	if _, err = os.Stat(filepath.Join(root, "index.html")); err != nil {
		fail(fmt.Errorf("Keep the app folder beside CodePad.exe: %w", err))
	}

	var listener net.Listener
	port := 0
	for i := 0; i < portCount; i++ {
		candidate := firstPort + i
		if existing(candidate) {
			url := fmt.Sprintf("http://127.0.0.1:%d/", candidate)
			openBrowser(url)
			return
		}
		if l, e := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", candidate)); e == nil {
			listener, port = l, candidate
			break
		}
	}
	if listener == nil {
		fail(fmt.Errorf("ports %d-%d are busy", firstPort, firstPort+portCount-1))
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	hosts := map[string]bool{fmt.Sprintf("127.0.0.1:%d", port): true, fmt.Sprintf("localhost:%d", port): true}
	var last atomic.Int64
	last.Store(time.Now().Unix())

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hosts[r.Host] {
			http.Error(w, "Invalid host", http.StatusForbidden)
			return
		}
		last.Store(time.Now().Unix())
		if r.URL.Path == "/__codepad_ok" {
			w.Header().Set("X-CodePad", marker)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		name := filepath.Clean(filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(r.URL.Path, "/"))))
		relative, err := filepath.Rel(root, name)
		if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if info, err := os.Stat(name); err == nil && info.IsDir() {
			name = filepath.Join(name, "index.html")
		}
		if r.URL.Path == "/launcher" {
			name = filepath.Join(root, "index.html") // same single-page entry as the web build
		}
		if _, err := os.Stat(name); err != nil {
			http.NotFound(w, r)
			return
		}
		if t := contentType(name); t != "" {
			w.Header().Set("Content-Type", t)
		}
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		http.ServeFile(w, r, name)
	})
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fail(err)
		}
	}()
	if os.Getenv("CODEPAD_NO_BROWSER") == "1" {
		fmt.Println(url)
	}

	cmd, opened := openBrowser(url)
	if !opened {
		fail(fmt.Errorf("could not open a browser; open %s manually", url))
	}
	if cmd != nil {
		_ = cmd.Wait() // own profile + app window: ends when the CodePad window is closed
		_ = server.Close()
		return
	}
	// Default-browser fallback (no Edge/Chrome found) or headless mode: stop after an hour without requests.
	for range time.Tick(time.Minute) {
		if time.Now().Unix()-last.Load() > 3600 {
			_ = server.Close()
			return
		}
	}
}
