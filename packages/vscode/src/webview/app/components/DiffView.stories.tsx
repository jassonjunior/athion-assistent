import type { Meta, StoryObj } from '@storybook/react-vite'
import { VSCodeDecorator } from '@athion/storybook/decorators'
import { DiffView } from './DiffView'

const meta = {
  title: 'VSCode/Chat/DiffView',
  component: DiffView,
  decorators: [VSCodeDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DiffView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    diff: `--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,7 @@
 import { parse } from 'node:path'
+import { readFile } from 'node:fs/promises'

 export function getExtension(file: string) {
-  return parse(file).ext
+  const { ext } = parse(file)
+  return ext.toLowerCase()
 }`,
  },
}

export const OnlyAdditions: Story = {
  args: {
    diff: `--- /dev/null
+++ b/src/newFile.ts
@@ -0,0 +1,5 @@
+export interface Config {
+  name: string
+  version: string
+  debug: boolean
+}`,
  },
}

export const OnlyDeletions: Story = {
  args: {
    diff: `--- a/src/old.ts
+++ b/src/old.ts
@@ -1,6 +1,2 @@
 export const config = {
-  deprecated: true,
-  legacyMode: true,
-  oldApi: '/v1',
-  timeout: 30000,
 }`,
  },
}

export const MultipleHunks: Story = {
  args: {
    diff: `--- a/src/server.ts
+++ b/src/server.ts
@@ -10,3 +10,3 @@
-const PORT = 3000
+const PORT = process.env.PORT ?? 3000

@@ -25,4 +25,6 @@
 app.get('/health', (req, res) => {
-  res.json({ status: 'ok' })
+  res.json({
+    status: 'ok',
+    uptime: process.uptime(),
+  })
 })`,
  },
}
