"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ImageIcon, Zap, Shield, Cpu } from "lucide-react";
import dynamic from "next/dynamic";

const PdfConverter = dynamic(() => import("@/components/PdfConverter"), { ssr: false });
const ImageEditor = dynamic(() => import("@/components/ImageEditor"), { ssr: false });

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Ambient background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 w-96 h-96 bg-blue-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-2">
            <Zap className="h-3.5 w-3.5" />
            Free · Instant · No sign-up required
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            <span className="gradient-text">ConvertX</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            The all-in-one file toolkit — convert PDFs and edit images in seconds, right in your browser.
          </p>

          {/* Feature badges */}
          <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
            {[
              { icon: <Shield className="h-3 w-3" />, text: "100% Secure" },
              { icon: <Cpu className="h-3 w-3" />, text: "Lightning Fast" },
              { icon: <Zap className="h-3 w-3" />, text: "Batch Processing" },
            ].map((b) => (
              <Badge
                key={b.text}
                variant="secondary"
                className="flex items-center gap-1.5 px-3 py-1"
              >
                {b.icon}
                {b.text}
              </Badge>
            ))}
          </div>
        </div>

        {/* Main card */}
        <Card className="bg-card/60 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
          <CardHeader className="pb-0 pt-6 px-6">
            <Tabs defaultValue="converter" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 h-12 rounded-xl mb-6">
                <TabsTrigger
                  value="converter"
                  className="flex items-center gap-2 rounded-lg text-sm font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200"
                >
                  <FileText className="h-4 w-4" />
                  PDF Converter
                </TabsTrigger>
                <TabsTrigger
                  value="image"
                  className="flex items-center gap-2 rounded-lg text-sm font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-600 data-[state=active]:to-rose-600 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200"
                >
                  <ImageIcon className="h-4 w-4" />
                  Image Editor
                </TabsTrigger>
              </TabsList>

              <CardContent className="px-0 pb-6">
                <TabsContent value="converter" className="mt-0">
                  <div className="space-y-2 mb-5">
                    <h2 className="text-xl font-semibold">PDF Converter</h2>
                    <p className="text-sm text-muted-foreground">
                      Transform your PDFs into Word, Excel, CSV, or HTML — beautifully formatted and ready to use.
                    </p>
                  </div>
                  <PdfConverter />
                </TabsContent>

                <TabsContent value="image" className="mt-0">
                  <div className="space-y-2 mb-5">
                    <h2 className="text-xl font-semibold">Image Editor</h2>
                    <p className="text-sm text-muted-foreground">
                      Resize, crop, rotate, flip, and enhance your images with pro-grade controls — no app needed.
                    </p>
                  </div>
                  <ImageEditor />
                </TabsContent>
              </CardContent>
            </Tabs>
          </CardHeader>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50 mt-8">
          Loved by thousands of creators, students, and professionals worldwide.
        </p>
      </div>
    </div>
  );
}
