package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	writeInPlace    = flag.Bool("w", false, "write result to (overwrite) files instead of stdout")
	keepDirectives  = flag.Bool("keep-directives", false, "preserve top-of-file build tags and //go: directives")
	excludePatterns multiFlag
	verbose         = flag.Bool("v", false, "verbose logging")
)

type multiFlag []string

func (m *multiFlag) String() string { return strings.Join(*m, ",") }
func (m *multiFlag) Set(s string) error {
	*m = append(*m, s)
	return nil
}

func main() {
	flag.Var(&excludePatterns, "exclude", "glob to skip (may be repeated), e.g. -exclude 'vendor/**' -exclude '**/*.pb.go'")
	flag.Parse()

	paths := flag.Args()
	if len(paths) == 0 {
		paths = []string{"."}
	}

	var hadError bool
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			fmt.Fprintf(os.Stderr, "stat %s: %v\n", p, err)
			hadError = true
			continue
		}
		if info.IsDir() {
			if err := processDir(p); err != nil {
				fmt.Fprintf(os.Stderr, "%v\n", err)
				hadError = true
			}
		} else {
			if err := processFile(p); err != nil {
				fmt.Fprintf(os.Stderr, "%v\n", err)
				hadError = true
			}
		}
	}

	if hadError {
		os.Exit(1)
	}
}

func processDir(root string) error {
	return filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "vendor" || name == "node_modules" || name == ".idea" || name == ".vscode" {
				return fs.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		if shouldExclude(path) {
			if *verbose {
				fmt.Println("skip (excluded):", path)
			}
			return nil
		}
		return processFile(path)
	})
}

func shouldExclude(path string) bool {
	if len(excludePatterns) == 0 {
		return false
	}

	for _, pat := range excludePatterns {
		match, _ := filepath.Match(pat, path)
		if match {
			return true
		}

		base := filepath.Base(path)
		matchBase, _ := filepath.Match(pat, base)
		if matchBase {
			return true
		}
	}
	return false
}

var (
	reDirectiveLine = regexp.MustCompile(`^\s*//\s*(?:\+build|go:build|go:[A-Za-z0-9_]+)`)
)

func extractTopDirectives(src []byte) (directives []string, rest []byte) {
	lines := bytes.Split(src, []byte("\n"))
	var keep []string
	i := 0

	for ; i < len(lines); i++ {
		l := lines[i]
		trim := bytes.TrimSpace(l)
		if len(trim) == 0 {
			keep = append(keep, string(l))
			continue
		}
		if bytes.HasPrefix(trim, []byte("//")) {

			if reDirectiveLine.Match(trim) {
				keep = append(keep, string(l))
			} else {

			}
			continue
		}

		break
	}
	return keep, bytes.Join(lines[i:], []byte("\n"))
}

func processFile(path string) error {
	orig, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}

	var header []string
	body := orig
	if *keepDirectives {
		header, body = extractTopDirectives(orig)
	}

	fset := token.NewFileSet()

	file, err := parser.ParseFile(fset, path, body, 0)
	if err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}

	if file == nil || file.Name == nil {
		return fmt.Errorf("parse produced empty AST for %s", path)
	}

	var buf bytes.Buffer
	if *keepDirectives && len(header) > 0 {
		for _, h := range header {
			buf.WriteString(h)
			if !strings.HasSuffix(h, "\n") {
				buf.WriteByte('\n')
			}
		}

		if !strings.HasSuffix(strings.Join(header, "\n"), "\n\n") {
			buf.WriteByte('\n')
		}
	}
	if err := format.Node(&buf, fset, file); err != nil {
		return fmt.Errorf("format %s: %w", path, err)
	}

	out := buf.Bytes()

	if *writeInPlace {
		if err := os.WriteFile(path, out, 0o666); err != nil {
			return fmt.Errorf("write %s: %w", path, err)
		}
		if *verbose {
			fmt.Println("wrote:", path)
		}
	} else {

		fmt.Printf("\n// ----- %s -----\n", path)
		os.Stdout.Write(out)
		fmt.Printf("\n// ----- end %s -----\n", path)
	}
	return nil
}

var _ = []any{ast.File{}}
