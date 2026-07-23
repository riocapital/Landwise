import fs from "fs";
import path from "path";

function readContent(file: string) {
  return fs.readFileSync(path.join(process.cwd(), "src/content", file), "utf-8");
}

export default function LandingPage() {
  const style = readContent("landing-style.css");
  const before = readContent("landing-before-form.html");
  const after = readContent("landing-after-form.html");

  return (
    <div className="lw-public">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,600;6..72,700&family=Inter:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: before }} />
      <div dangerouslySetInnerHTML={{ __html: after }} />
    </div>
  );
}
