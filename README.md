# ConvertX

**ConvertX** is a powerful, privacy-first web application for all-in-one file processing. It allows you to convert PDFs and edit images directly in your browser—meaning **100% local processing, zero server uploads, and absolute privacy.**

## 🚀 Key Features

### 📄 PDF Converter
Batch process your PDF documents into various manageable formats with one click.
- **Supported Outputs**: DOCX, XLSX, CSV, and HTML.
- **Batch Processing**: Upload multiple files and convert them simultaneously.
- **Privacy Guaranteed**: Your documents never leave your machine; all conversion logic runs locally.

### 🖼️ Image Editor
A professional-grade image editor with real-time feedback.
- **Transformations**: Resize (with aspect ratio lock), Crop (free-form or aspect-locked), Rotate (90° increments), and Flip (Horizontal/Vertical).
- **Advanced Adjustments**: Fine-tune Brightness, Contrast, Saturation, Hue, Blur, and Opacity.
- **Smart Preview**: Instant live preview using high-performance CSS filters.
- **High-Quality Export**: Export your edited images as PNG files.

## 🛠️ Technical Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router & TypeScript)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Components**: [Shadcn UI](https://ui.shadcn.com/) & [Base UI](https://base-ui.com/)
- **Processing Engines**: 
  - `pdf-parse` & `xlsx` & `docx` for PDF conversions.
  - `react-image-crop` for image precision.

## 🏁 Getting Started

### Prerequisites
- Node.js (v20 or higher)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/tanmay0996/ConvertX.git
   cd ConvertX
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔒 Privacy & Security
ConvertX is built on the principle of data sovereignty. No analytical data, file contents, or personal information is ever transmitted to a server. All processing is handled by your browser's local resources.

---
Built with ❤️ by [tanmay0996](https://github.com/tanmay0996)
