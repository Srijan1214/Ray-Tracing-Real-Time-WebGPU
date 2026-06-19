import { mat4, vec3 } from "gl-matrix"
import { Camera } from "./camera"

export class World {
	static readonly MAX_SPHERES = 50
	// World properties
	public camera: Camera
	private device: GPUDevice

	private canvasSizeBuffer: GPUBuffer
	private cameraUniformBuffer: GPUBuffer
	private spheresArrayBuffer: GPUBuffer
	private sphereExistsArrayBuffer: GPUBuffer
	private directionalLightUniformBuffer: GPUBuffer
	private sphereSizeBuffer: GPUBuffer

	// CPU-side representation
	private spheres: {
		center: [number, number, number]
		radius: number
		exists: boolean
        albedo: [number, number, number, number]
	}[] = []

	constructor(
		device: GPUDevice,
		viewportWidth: number,
		viewportHeight: number
	) {
		this.device = device
		this.camera = new Camera(
			45.0,
			0.1,
			100.0,
			viewportWidth,
			viewportHeight
		)
		this.allocateUniformBuffers()
		this.updateCanvasSizeUniform(viewportWidth, viewportHeight)
		this.updateCameraUniform(
			this.camera.inverseProjection,
			this.camera.inverseView,
			this.camera.projection,
			this.camera.view,
			this.camera.position
		)
		// Initialize with one default sphere
		// Pre-allocate spheres array to MAX_SPHERES, only first exists
		this.spheres = Array(World.MAX_SPHERES)
			.fill(null)
			.map((_, i) => ({ center: [0, 0, 0], radius: 1, exists: false, albedo: [1.0, 1.0, 1.0, 1.0] }))
		this.spheres[0] = { center: [0, 0, 0], radius: 1, exists: true, albedo: [1.0, 0.0, 0.0, 1.0] }
		this.spheres[1] = { center: [2, 3, -5], radius: 1, exists: true, albedo: [0.0, 1.0, 0.0, 1.0] }
		// this.spheres[2] = { center: [0, -30, 0], radius: 28, exists: true, albedo: [0.0, 0.0, 1.0, 1.0] }
		this.syncSpheresToGPU()
		this.updateDirectionalLightUniform(vec3.fromValues(-1.0, -1.0, -1.0))
	}

	resizeWidthHeight(width: number, height: number) {
		this.camera.onResize(width, height)
		this.updateCanvasSizeUniform(width, height)
	}

	updateCanvasSizeUniform(canvasWidth: number, canvasHeight: number) {
		const canvasSizeData = new Float32Array([canvasWidth, canvasHeight])
		this.device.queue.writeBuffer(this.canvasSizeBuffer, 0, canvasSizeData)
	}

	updateCameraUniform(
		inverseProjection: mat4,
		inverseView: mat4,
		projection: mat4,
		view: mat4,
		cameraPosition: vec3
	) {
		const cameraData = new Float32Array(68) // 4 matrices (64 floats) + position (3 floats) + padding (1 float)
		cameraData.set(inverseProjection, 0) // Offset 0-15
		cameraData.set(inverseView, 16) // Offset 16-31
		cameraData.set(projection, 32) // Offset 32-47
		cameraData.set(view, 48) // Offset 48-63
		cameraData[64] = cameraPosition[0] // Position X
		cameraData[65] = cameraPosition[1] // Position Y
		cameraData[66] = cameraPosition[2] // Position Z
		// cameraData[67] is padding for alignment
		this.device.queue.writeBuffer(this.cameraUniformBuffer, 0, cameraData)
	}

	private allocateUniformBuffers() {
		// Canvas size buffer
		this.canvasSizeBuffer = this.device.createBuffer({
			size: 8, // 2 floats
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})

		// Camera uniform buffer (4 matrices + position + padding)
		this.cameraUniformBuffer = this.device.createBuffer({
			size: 68 * 4, // 68 floats * 4 bytes = 272 bytes
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})

		// Sphere array buffer (16 bytes per sphere: vec3 center + f32 radius)
		this.spheresArrayBuffer = this.device.createBuffer({
			label: "Sphere array buffer",
			size: 32 * World.MAX_SPHERES,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})

		// Sphere existence boolean buffer (1 byte per sphere, padded to 4 bytes for alignment)
		this.sphereExistsArrayBuffer = this.device.createBuffer({
			label: "Sphere existence buffer",
			size: 4 * 4 * Math.ceil(World.MAX_SPHERES / 4),
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})

		// Directional light uniform buffer
		this.directionalLightUniformBuffer = this.device.createBuffer({
			size: 16, // vec3 + padding for uniform alignment
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})

		// Sphere count buffer (u32), always set to MAX_SPHERES
		this.sphereSizeBuffer = this.device.createBuffer({
			label: "Sphere count buffer",
			size: 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		})
		const maxSpheresData = new Uint32Array([World.MAX_SPHERES])
		this.device.queue.writeBuffer(this.sphereSizeBuffer, 0, maxSpheresData)
	}

	// Update a single sphere at index
	updateSphereAt(
		index: number,
		center: [number, number, number],
		radius: number,
		albedo: [number, number, number, number]
	) {
		if (index < 0 || index >= World.MAX_SPHERES) return;
		this.spheres[index].center = center;
		this.spheres[index].radius = radius;
		this.spheres[index].exists = true;
		this.spheres[index].albedo = albedo;
		this.syncSpheresToGPU();
	}

	// Add a new sphere (returns index or -1 if full)
	addSphere(
		center: [number, number, number] = [0, 0, 0],
		radius: number = 1,
		albedo: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0]
	): number {
		let idx = this.spheres.findIndex((s) => !s.exists);
		if (idx === -1) return -1;
		this.spheres[idx].center = center;
		this.spheres[idx].radius = radius;
		this.spheres[idx].exists = true;
		this.spheres[idx].albedo = albedo;
		this.syncSpheresToGPU();
		return idx;
	}

	// Delete a sphere at index
	deleteSphere(index: number) {
		if (index < 0 || index >= this.spheres.length) return
		this.spheres[index].exists = false
		this.syncSpheresToGPU()
	}

	// Get all spheres (for UI)
	getSpheres() {
		return this.spheres
	}

	// Sync all spheres and existence flags to GPU
	private syncSpheresToGPU() {
		const max = World.MAX_SPHERES
		const sphereData = new Float32Array(8 * max)
		const existsData = new Uint32Array(max)
		for (let i = 0; i < max; ++i) {
			const s = this.spheres[i]
			if (s && s.exists) {
				sphereData[i * 8 + 0] = s.center[0]
				sphereData[i * 8 + 1] = s.center[1]
				sphereData[i * 8 + 2] = s.center[2]
				sphereData[i * 8 + 3] = s.radius
                sphereData[i * 8 + 4] = s.albedo[0]
                sphereData[i * 8 + 5] = s.albedo[1]
                sphereData[i * 8 + 6] = s.albedo[2]
                sphereData[i * 8 + 7] = s.albedo[3]
				existsData[i] = 1
			} else {
				existsData[i] = 0
			}
		}
		this.device.queue.writeBuffer(
			this.spheresArrayBuffer,
			0,
			sphereData.buffer
		)
		this.device.queue.writeBuffer(
			this.sphereExistsArrayBuffer,
			0,
			existsData.buffer
		)
	}

	updateDirectionalLightUniform(direction: vec3) {
		const lightData = new Float32Array([
			direction[0],
			direction[1],
			direction[2],
			0,
		])
		this.device.queue.writeBuffer(
			this.directionalLightUniformBuffer,
			0,
			lightData
		)
	}

	getCameraUniformBuffer(): GPUBuffer {
		return this.cameraUniformBuffer
	}

	getDirectionalLightUniformBuffer(): GPUBuffer {
		return this.directionalLightUniformBuffer
	}

	getWorldGpuUniformBuffers(): GPUBuffer[] {
		return [
			this.canvasSizeBuffer,
			this.cameraUniformBuffer,
			this.spheresArrayBuffer,
			this.sphereExistsArrayBuffer,
			this.sphereSizeBuffer,
			this.directionalLightUniformBuffer,
		]
	}

	getCamera(): Camera {
		return this.camera
	}
}
