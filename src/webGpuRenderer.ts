import { World } from "./world"
import { createUvSphereMesh } from "./sphere"

export type RenderMode = "raster" | "raytrace"

export class WebGPURenderer {
	private device: GPUDevice
	private canvasContext: GPUCanvasContext
	private fullscreenVertexBuffer: GPUBuffer
	private fullscreenVertices = new Float32Array([
		-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
	])
	private meshVertexBuffer: GPUBuffer
	private meshIndexBuffer: GPUBuffer
	private gridVertexBuffer: GPUBuffer
	private gridVertexCount: number
	private instanceBuffer: GPUBuffer
	private indexCount: number
	private maxInstances: number
	private raytraceStorageTexture: GPUTexture
	private raytraceWidth: number
	private raytraceHeight: number
	private depthTexture: GPUTexture
	private depthWidth: number
	private depthHeight: number
	private rasterPipeline: GPURenderPipeline
	private gridPipeline: GPURenderPipeline
	private blitPipeline: GPURenderPipeline
	private computePipeline: GPUComputePipeline
	private rasterBindGroup: GPUBindGroup
	private gridBindGroup: GPUBindGroup
	private blitBindGroup: GPUBindGroup
	private computeBindGroup: GPUBindGroup
	private renderMode: RenderMode = "raster"
	private showGrid: boolean = true
	world: World
	private lastFrameTime: number
	private timeStepInputHandler: (deltaTime: number) => void

	constructor(
		device: GPUDevice,
		canvasContext: GPUCanvasContext,
		rasterPipeline: GPURenderPipeline,
		gridPipeline: GPURenderPipeline,
		blitPipeline: GPURenderPipeline,
		computePipeline: GPUComputePipeline,
		world: World,
		timeStepInputHandler: (deltaTime: number) => void
	) {
		this.device = device
		this.canvasContext = canvasContext
		this.rasterPipeline = rasterPipeline
		this.gridPipeline = gridPipeline
		this.blitPipeline = blitPipeline
		this.computePipeline = computePipeline
		this.world = world

		this.fullscreenVertexBuffer = device.createBuffer({
			label: "Fullscreen vertices",
			size: this.fullscreenVertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		})
		device.queue.writeBuffer(this.fullscreenVertexBuffer, 0, this.fullscreenVertices)

		const sphereMesh = createUvSphereMesh(16, 24)
		this.meshVertexBuffer = device.createBuffer({
			label: "Sphere mesh vertices",
			size: sphereMesh.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		})
		device.queue.writeBuffer(this.meshVertexBuffer, 0, sphereMesh.vertices)

		this.meshIndexBuffer = device.createBuffer({
			label: "Sphere mesh indices",
			size: sphereMesh.indices.byteLength,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		})
		device.queue.writeBuffer(this.meshIndexBuffer, 0, sphereMesh.indices)
		this.indexCount = sphereMesh.indices.length

		const gridVertices = this.createGridVertices(25, 1)
		this.gridVertexBuffer = device.createBuffer({
			label: "Grid vertices",
			size: gridVertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		})
		device.queue.writeBuffer(this.gridVertexBuffer, 0, gridVertices)
		this.gridVertexCount = gridVertices.length / 6

		this.maxInstances = World.MAX_SPHERES
		this.instanceBuffer = device.createBuffer({
			label: "Sphere instance buffer",
			size: this.maxInstances * 8 * 4,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		})

		this.depthWidth = this.world.camera.viewportWidth
		this.depthHeight = this.world.camera.viewportHeight
		this.depthTexture = this.createDepthTexture()
		this.raytraceWidth = this.world.camera.viewportWidth
		this.raytraceHeight = this.world.camera.viewportHeight
		this.raytraceStorageTexture = this.createRaytraceStorageTexture()

		// Bind camera and light uniforms for raster shading.
		this.rasterBindGroup = this.device.createBindGroup({
			layout: this.rasterPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: { buffer: this.world.getCameraUniformBuffer() },
				},
				{
					binding: 1,
					resource: {
						buffer: this.world.getDirectionalLightUniformBuffer(),
					},
				},
			],
		})

		this.gridBindGroup = this.device.createBindGroup({
			layout: this.gridPipeline.getBindGroupLayout(0),
			entries: [
				{
					binding: 0,
					resource: { buffer: this.world.getCameraUniformBuffer() },
				},
			],
		})

		const sampler = this.device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
		})

		this.blitBindGroup = this.device.createBindGroup({
			layout: this.blitPipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: this.raytraceStorageTexture.createView() },
				{ binding: 1, resource: sampler },
			],
		})

		const computeEntries: GPUBindGroupEntry[] = [
			{ binding: 0, resource: this.raytraceStorageTexture.createView() },
			...this.world
				.getWorldGpuUniformBuffers()
				.map((gpuBuffer: GPUBuffer, index: number) => ({
					binding: index + 1,
					resource: { buffer: gpuBuffer },
				})),
		]
		this.computeBindGroup = this.device.createBindGroup({
			layout: this.computePipeline.getBindGroupLayout(0),
			entries: computeEntries,
		})

		this.lastFrameTime = Date.now()
		this.timeStepInputHandler = timeStepInputHandler
	}

	private createDepthTexture(): GPUTexture {
		return this.device.createTexture({
			size: [this.depthWidth, this.depthHeight],
			format: "depth24plus",
			usage: GPUTextureUsage.RENDER_ATTACHMENT,
		})
	}

	private createRaytraceStorageTexture(): GPUTexture {
		return this.device.createTexture({
			size: [this.raytraceWidth, this.raytraceHeight],
			format: "rgba8unorm",
			usage:
				GPUTextureUsage.STORAGE_BINDING |
				GPUTextureUsage.TEXTURE_BINDING |
				GPUTextureUsage.COPY_SRC |
				GPUTextureUsage.RENDER_ATTACHMENT,
		})
	}

	private createGridVertices(halfExtent: number, step: number): Float32Array {
		const vertices: number[] = []
		const majorColor = [0.35, 0.35, 0.35]
		const minorColor = [0.18, 0.18, 0.18]
		const axisXColor = [0.95, 0.25, 0.25]
		const axisZColor = [0.25, 0.5, 0.95]

		const pushVertex = (
			x: number,
			y: number,
			z: number,
			r: number,
			g: number,
			b: number
		) => {
			vertices.push(x, y, z, r, g, b)
		}

		for (let i = -halfExtent; i <= halfExtent; i += step) {
			const isAxis = i === 0
			const isMajor = i % 5 === 0

			const xColor = isAxis
				? axisXColor
				: isMajor
					? majorColor
					: minorColor
			const zColor = isAxis
				? axisZColor
				: isMajor
					? majorColor
					: minorColor

			// Line parallel to X (vary x, fixed z)
			pushVertex(-halfExtent, 0, i, xColor[0], xColor[1], xColor[2])
			pushVertex(halfExtent, 0, i, xColor[0], xColor[1], xColor[2])

			// Line parallel to Z (vary z, fixed x)
			pushVertex(i, 0, -halfExtent, zColor[0], zColor[1], zColor[2])
			pushVertex(i, 0, halfExtent, zColor[0], zColor[1], zColor[2])
		}

		return new Float32Array(vertices)
	}

	private ensureDepthTextureSize() {
		const width = this.world.camera.viewportWidth
		const height = this.world.camera.viewportHeight
		const recreate = this.depthWidth !== width || this.depthHeight !== height
		if (recreate) {
			this.depthWidth = width
			this.depthHeight = height
			this.depthTexture.destroy()
			this.depthTexture = this.createDepthTexture()
		}
	}

	private ensureRaytraceTextureSize() {
		const width = this.world.camera.viewportWidth
		const height = this.world.camera.viewportHeight
		const recreate =
			this.raytraceWidth !== width || this.raytraceHeight !== height
		if (recreate) {
			this.raytraceWidth = width
			this.raytraceHeight = height
			this.raytraceStorageTexture.destroy()
			this.raytraceStorageTexture = this.createRaytraceStorageTexture()

			const sampler = this.device.createSampler({
				magFilter: "linear",
				minFilter: "linear",
			})
			this.blitBindGroup = this.device.createBindGroup({
				layout: this.blitPipeline.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: this.raytraceStorageTexture.createView() },
					{ binding: 1, resource: sampler },
				],
			})

			const computeEntries: GPUBindGroupEntry[] = [
				{ binding: 0, resource: this.raytraceStorageTexture.createView() },
				...this.world
					.getWorldGpuUniformBuffers()
					.map((gpuBuffer: GPUBuffer, index: number) => ({
						binding: index + 1,
						resource: { buffer: gpuBuffer },
					})),
			]
			this.computeBindGroup = this.device.createBindGroup({
				layout: this.computePipeline.getBindGroupLayout(0),
				entries: computeEntries,
			})
		}
	}

	private updateInstanceBuffer(): number {
		const spheres = this.world.getSpheres()
		const data = new Float32Array(this.maxInstances * 8)
		let activeCount = 0

		for (let i = 0; i < spheres.length; i++) {
			const sphere = spheres[i]
			if (!sphere.exists) continue

			const base = activeCount * 8
			data[base + 0] = sphere.center[0]
			data[base + 1] = sphere.center[1]
			data[base + 2] = sphere.center[2]
			data[base + 3] = sphere.radius
			data[base + 4] = sphere.albedo[0]
			data[base + 5] = sphere.albedo[1]
			data[base + 6] = sphere.albedo[2]
			data[base + 7] = sphere.albedo[3]
			activeCount++
		}

		if (activeCount > 0) {
			const bytes = activeCount * 8 * 4
			this.device.queue.writeBuffer(this.instanceBuffer, 0, data.buffer, 0, bytes)
		}

		return activeCount
	}

	// Render
	render() {
		if (this.renderMode === "raster") {
			this.ensureDepthTextureSize()
			const activeSphereCount = this.updateInstanceBuffer()

			const encoder = this.device.createCommandEncoder()
			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: this.canvasContext.getCurrentTexture().createView(),
						loadOp: "clear",
						clearValue: { r: 0.03, g: 0.03, b: 0.05, a: 1.0 },
						storeOp: "store",
					},
				],
				depthStencilAttachment: {
					view: this.depthTexture.createView(),
					depthLoadOp: "clear",
					depthClearValue: 1.0,
					depthStoreOp: "store",
				},
			})
			pass.setPipeline(this.rasterPipeline)
			if (this.showGrid && this.gridVertexCount > 0) {
				pass.setPipeline(this.gridPipeline)
				pass.setBindGroup(0, this.gridBindGroup)
				pass.setVertexBuffer(0, this.gridVertexBuffer)
				pass.draw(this.gridVertexCount)
			}
			pass.setPipeline(this.rasterPipeline)
			pass.setBindGroup(0, this.rasterBindGroup)
			pass.setVertexBuffer(0, this.meshVertexBuffer)
			pass.setVertexBuffer(1, this.instanceBuffer)
			pass.setIndexBuffer(this.meshIndexBuffer, "uint16")
			if (activeSphereCount > 0) {
				pass.drawIndexed(this.indexCount, activeSphereCount)
			}
			pass.end()
			this.device.queue.submit([encoder.finish()])
			return
		}

		this.ensureRaytraceTextureSize()

		const encoder = this.device.createCommandEncoder()

		const computePass = encoder.beginComputePass()
		computePass.setPipeline(this.computePipeline)
		computePass.setBindGroup(0, this.computeBindGroup)
		computePass.dispatchWorkgroups(
			Math.ceil(this.world.camera.viewportWidth / 8),
			Math.ceil(this.world.camera.viewportHeight / 8)
		)
		computePass.end()

		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: this.canvasContext.getCurrentTexture().createView(),
					loadOp: "clear",
					clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
					storeOp: "store",
				},
			],
		})
		pass.setPipeline(this.blitPipeline)
		pass.setBindGroup(0, this.blitBindGroup)
		pass.setVertexBuffer(0, this.fullscreenVertexBuffer)
		pass.draw(this.fullscreenVertices.length / 2)
		pass.end()
		this.device.queue.submit([encoder.finish()])
	}

	setRenderMode(mode: RenderMode) {
		this.renderMode = mode
	}

	getRenderMode(): RenderMode {
		return this.renderMode
	}

	setShowGrid(show: boolean) {
		this.showGrid = show
	}

	getShowGrid(): boolean {
		return this.showGrid
	}

	// Animation loop
	animate(currentFrameTime: number) {
		const deltaTime = currentFrameTime - this.lastFrameTime
		this.lastFrameTime = currentFrameTime

		this.timeStepInputHandler(deltaTime)

		this.render()
		requestAnimationFrame((t) => this.animate(t))
	}
}
