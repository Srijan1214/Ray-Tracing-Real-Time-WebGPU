import { InputManager, InputState } from "./InputManager"
import { World } from "./world"

export class WorldStateManager {
	world: World
	inputManager: InputManager

	constructor(world: World, inputManager: InputManager) {
		this.world = world
		this.inputManager = inputManager
	}

	// --- Spheres API for UI ---
	getSpheres() {
		return this.world.getSpheres()
	}

	addSphere(center?: [number, number, number], radius?: number, albedo?: [number, number, number, number]) {
		return this.world.addSphere(center, radius, albedo);
	}

	updateSphereAt(
		index: number,
		sphere: {
			center: [number, number, number];
			radius: number;
			exists: boolean;
			albedo: [number, number, number, number];
		}
	) {
		this.world.updateSphereAt(index, sphere.center, sphere.radius, sphere.albedo)
	}

	deleteSphere(index: number) {
		this.world.deleteSphere(index)
	}

	resizeEventHandler(canvasWidth: number, canvasHeight: number) {
		this.world.resizeWidthHeight(canvasWidth, canvasHeight)
	}

	updateWorldForNextFrame(deltaTime: number) {
		const inputState = this.inputManager.getInput()
		if (inputState.hasActiveCurrentInput) {
			const camera = this.world.getCamera()
			camera.onUpdate(deltaTime, inputState)
			this.world.updateCameraUniform(
				camera.inverseProjection,
				camera.inverseView,
				camera.projection,
				camera.view,
				camera.position
			)
		}
		this.inputManager.setLastMousePosition(inputState.curMousePosition)
	}

	controlPanelUpdateDirectionalLight(
		lightDirection: [number, number, number]
	) {
		const directionVec = new Float32Array(lightDirection)
		this.world.updateDirectionalLightUniform(directionVec)
	}

	controlPanelUpdateCameraProps(
		verticalFOV: number,
		nearClip: number,
		farClip: number
	) {
		this.world
			.getCamera()
			.updateCameraProperties(verticalFOV, nearClip, farClip)
		const camera = this.world.getCamera()
		this.world.updateCameraUniform(
			camera.inverseProjection,
			camera.inverseView,
			camera.projection,
			camera.view,
			camera.position
		)
	}
}
