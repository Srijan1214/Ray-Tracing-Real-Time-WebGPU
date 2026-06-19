/// <reference types="@webgpu/types" />
import { loadShader } from "./shaders"
import { WebGPURenderer } from "./webGpuRenderer"
import { World } from "./world"

export class WebGpuManager {
	private device: GPUDevice
	private canvas: HTMLCanvasElement
	private canvasContext: GPUCanvasContext
	private canvasFormat: GPUCanvasFormat
	private rasterVertexShaderModule: GPUShaderModule | undefined
	private rasterFragmentShaderModule: GPUShaderModule | undefined
	private gridVertexShaderModule: GPUShaderModule | undefined
	private gridFragmentShaderModule: GPUShaderModule | undefined
	private fullscreenVertexShaderModule: GPUShaderModule | undefined
	private fullscreenFragmentShaderModule: GPUShaderModule | undefined
	private rayGenComputeShaderModule: GPUShaderModule | undefined
	private renderer: WebGPURenderer | undefined

	static async initialize(canvas: HTMLCanvasElement): Promise<WebGpuManager> {
		const instance = new WebGpuManager()
		await instance.initWebGPU(canvas)
		return instance
	}

	async initWebGPU(canvas: HTMLCanvasElement) {
		if (!navigator.gpu) throw new Error("WebGPU not supported.")

		const adapter = await navigator.gpu.requestAdapter()
		if (!adapter) throw new Error("No GPUAdapter found.")
		this.device = await adapter.requestDevice()
		this.canvasFormat = navigator.gpu.getPreferredCanvasFormat()

		// Raster shaders
		this.rasterVertexShaderModule = await loadShader(
			this.device,
			"/shaders/rasterVertex.wgsl",
			"Raster vertex shader"
		)
		this.rasterFragmentShaderModule = await loadShader(
			this.device,
			"/shaders/rasterFragment.wgsl",
			"Raster fragment shader"
		)
		this.gridVertexShaderModule = await loadShader(
			this.device,
			"/shaders/gridVertex.wgsl",
			"Grid vertex shader"
		)
		this.gridFragmentShaderModule = await loadShader(
			this.device,
			"/shaders/gridFragment.wgsl",
			"Grid fragment shader"
		)
		this.fullscreenVertexShaderModule = await loadShader(
			this.device,
			"/shaders/vertex.wgsl",
			"Fullscreen vertex shader"
		)
		this.fullscreenFragmentShaderModule = await loadShader(
			this.device,
			"/shaders/fragment.wgsl",
			"Fullscreen fragment shader"
		)
		this.rayGenComputeShaderModule = await loadShader(
			this.device,
			"/shaders/rayGenCompute.wgsl",
			"Ray generation compute shader"
		)

		this.canvasContext = canvas.getContext("webgpu") as GPUCanvasContext
		this.canvasContext.configure({
			device: this.device,
			format: this.canvasFormat,
			alphaMode: "opaque",
		})
	}

	getWorldRenderer(
		world: World,
		timeStepInputHandler: (deltaTime: number) => void
	): WebGPURenderer {
		const vertexBufferLayout: GPUVertexBufferLayout = {
			arrayStride: 24,
			stepMode: "vertex",
			attributes: [
				{ format: "float32x3", offset: 0, shaderLocation: 0 },
				{ format: "float32x3", offset: 12, shaderLocation: 1 },
			],
		}

		const instanceBufferLayout: GPUVertexBufferLayout = {
			arrayStride: 32,
			stepMode: "instance",
			attributes: [
				{ format: "float32x4", offset: 0, shaderLocation: 2 },
				{ format: "float32x4", offset: 16, shaderLocation: 3 },
			],
		}

		const renderPipeline = this.device.createRenderPipeline({
			label: "Raster sphere pipeline",
			layout: "auto",
			vertex: {
				module: this.rasterVertexShaderModule,
				entryPoint: "vertexMain",
				buffers: [vertexBufferLayout, instanceBufferLayout],
			},
			fragment: {
				module: this.rasterFragmentShaderModule,
				entryPoint: "fragmentMain",
				targets: [{ format: this.canvasFormat }],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
				frontFace: "ccw",
			},
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: true,
				depthCompare: "less",
			},
		})

		const gridVertexBufferLayout: GPUVertexBufferLayout = {
			arrayStride: 24,
			stepMode: "vertex",
			attributes: [
				{ format: "float32x3", offset: 0, shaderLocation: 0 },
				{ format: "float32x3", offset: 12, shaderLocation: 1 },
			],
		}

		const gridPipeline = this.device.createRenderPipeline({
			label: "Raster grid pipeline",
			layout: "auto",
			vertex: {
				module: this.gridVertexShaderModule,
				entryPoint: "vertexMain",
				buffers: [gridVertexBufferLayout],
			},
			fragment: {
				module: this.gridFragmentShaderModule,
				entryPoint: "fragmentMain",
				targets: [{ format: this.canvasFormat }],
			},
			primitive: {
				topology: "line-list",
			},
			depthStencil: {
				format: "depth24plus",
				depthWriteEnabled: false,
				depthCompare: "less-equal",
			},
		})

		const fullscreenVertexBufferLayout: GPUVertexBufferLayout = {
			arrayStride: 8,
			attributes: [
				{ format: "float32x2", offset: 0, shaderLocation: 0 },
			],
		}

		const blitPipeline = this.device.createRenderPipeline({
			label: "Raytrace presentation pipeline",
			layout: "auto",
			vertex: {
				module: this.fullscreenVertexShaderModule,
				entryPoint: "vertexMain",
				buffers: [fullscreenVertexBufferLayout],
			},
			fragment: {
				module: this.fullscreenFragmentShaderModule,
				entryPoint: "fragmentMain",
				targets: [{ format: this.canvasFormat }],
			},
			primitive: {
				topology: "triangle-list",
			},
		})

		const computePipeline = this.device.createComputePipeline({
			label: "Raytrace compute pipeline",
			layout: "auto",
			compute: {
				module: this.rayGenComputeShaderModule!,
				entryPoint: "main",
			},
		})

		this.renderer = new WebGPURenderer(
			this.device,
			this.canvasContext,
			renderPipeline,
			gridPipeline,
			blitPipeline,
			computePipeline,
			world,
			timeStepInputHandler
		)
		return this.renderer
	}

	getDevice(): GPUDevice {
		return this.device
	}
}
