export interface Sphere {
	center: [number, number, number]
	radius: number
}

export interface SphereMesh {
	vertices: Float32Array
	indices: Uint16Array
}

// Generates a unit UV sphere with interleaved position/normal vertex layout.
export function createUvSphereMesh(
	stacks: number = 160,
	slices: number = 240
): SphereMesh {
	const vertices: number[] = []
	const indices: number[] = []

	for (let stack = 0; stack <= stacks; stack++) {
		const v = stack / stacks
		const theta = v * Math.PI
		const sinTheta = Math.sin(theta)
		const cosTheta = Math.cos(theta)

		for (let slice = 0; slice <= slices; slice++) {
			const u = slice / slices
			const phi = u * Math.PI * 2.0
			const sinPhi = Math.sin(phi)
			const cosPhi = Math.cos(phi)

			const x = sinTheta * cosPhi
			const y = cosTheta
			const z = sinTheta * sinPhi

			// position
			vertices.push(x, y, z)
			// normal (unit sphere)
			vertices.push(x, y, z)
		}
	}

	for (let stack = 0; stack < stacks; stack++) {
		for (let slice = 0; slice < slices; slice++) {
			const rowSize = slices + 1
			const topLeft = stack * rowSize + slice
			const bottomLeft = (stack + 1) * rowSize + slice
			const topRight = topLeft + 1
			const bottomRight = bottomLeft + 1

			indices.push(topLeft, bottomLeft, topRight)
			indices.push(topRight, bottomLeft, bottomRight)
		}
	}

	return {
		vertices: new Float32Array(vertices),
		indices: new Uint16Array(indices),
	}
}
