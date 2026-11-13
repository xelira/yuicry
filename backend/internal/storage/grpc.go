package storage

import (
	"context"
	"encoding/json"
	"net"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/encoding"
	"google.golang.org/grpc/status"
)

type jsonCodec struct{}

func (jsonCodec) Marshal(value any) ([]byte, error) {
	return json.Marshal(value)
}

func (jsonCodec) Unmarshal(data []byte, value any) error {
	return json.Unmarshal(data, value)
}

func (jsonCodec) Name() string {
	return "json"
}

func init() {
	encoding.RegisterCodec(jsonCodec{})
}

type SizeRequest struct {
	ID string
}

type SizeReply struct {
	Size int64
}

type ReadRequest struct {
	ID     string
	Offset int64
	Size   int
}

type ReadReply struct {
	Data []byte
}

type PutRequest struct {
	ID   string
	Data []byte
}

type PutReply struct{}

type Service interface {
	Size(context.Context, *SizeRequest) (*SizeReply, error)
	ReadAt(context.Context, *ReadRequest) (*ReadReply, error)
	Put(context.Context, *PutRequest) (*PutReply, error)
}

var serviceDescription = grpc.ServiceDesc{
	ServiceName: "yuicry.storage",
	HandlerType: (*Service)(nil),
	Methods: []grpc.MethodDesc{
		{MethodName: "Size", Handler: sizeHandler},
		{MethodName: "ReadAt", Handler: readAtHandler},
		{MethodName: "Put", Handler: putHandler},
	},
	Metadata: "yuicry.storage",
}

func Serve(addr, dir string) error {
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}

	server := grpc.NewServer(
		grpc.MaxRecvMsgSize(64<<20),
		grpc.MaxSendMsgSize(64<<20),
	)
	server.RegisterService(&serviceDescription, diskService{Disk: Disk{Dir: dir}})
	return server.Serve(listener)
}

type diskService struct {
	Disk Disk
}

func (s diskService) Size(ctx context.Context, request *SizeRequest) (*SizeReply, error) {
	if err := ValidID(request.ID); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	size, err := s.Disk.Size(ctx, request.ID)
	if err != nil {
		return nil, status.Error(codes.NotFound, "нет файла")
	}
	return &SizeReply{Size: size}, nil
}

func (s diskService) ReadAt(ctx context.Context, request *ReadRequest) (*ReadReply, error) {
	if err := ValidID(request.ID); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	if request.Size <= 0 || request.Size > 8<<20 {
		return nil, status.Error(codes.InvalidArgument, "плохой размер")
	}

	data, err := s.Disk.ReadAt(ctx, request.ID, request.Offset, request.Size)
	if err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &ReadReply{Data: data}, nil
}

func (s diskService) Put(ctx context.Context, request *PutRequest) (*PutReply, error) {
	if err := ValidID(request.ID); err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	if len(request.Data) == 0 {
		return nil, status.Error(codes.InvalidArgument, "пустые данные")
	}

	if err := s.Disk.Put(ctx, request.ID, request.Data); err != nil {
		return nil, status.Error(codes.Internal, err.Error())
	}
	return &PutReply{}, nil
}

type Client struct {
	conn *grpc.ClientConn
}

func Dial(addr string) (*Client, error) {
	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(
			grpc.CallContentSubtype("json"),
			grpc.MaxCallRecvMsgSize(64<<20),
			grpc.MaxCallSendMsgSize(64<<20),
		),
	)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn}, nil
}

func (c *Client) Size(ctx context.Context, id string) (int64, error) {
	reply := new(SizeReply)
	if err := c.conn.Invoke(ctx, "/yuicry.storage/Size", &SizeRequest{ID: id}, reply); err != nil {
		return 0, err
	}
	return reply.Size, nil
}

func (c *Client) ReadAt(ctx context.Context, id string, offset int64, size int) ([]byte, error) {
	reply := new(ReadReply)
	request := &ReadRequest{ID: id, Offset: offset, Size: size}
	if err := c.conn.Invoke(ctx, "/yuicry.storage/ReadAt", request, reply); err != nil {
		return nil, err
	}
	return reply.Data, nil
}

func (c *Client) Put(ctx context.Context, id string, data []byte) error {
	request := &PutRequest{ID: id, Data: data}
	return c.conn.Invoke(ctx, "/yuicry.storage/Put", request, new(PutReply))
}

func (c *Client) Close() error {
	return c.conn.Close()
}
